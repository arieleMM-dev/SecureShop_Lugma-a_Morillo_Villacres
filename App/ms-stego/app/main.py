import asyncio,hashlib,json,logging,os,re
from contextlib import asynccontextmanager
from datetime import datetime,timezone
from uuid import UUID,uuid4
from pathlib import Path
from fastapi import FastAPI,Request,HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel,ConfigDict
from .settings import Settings
from .security import Security
from .store import Store
from .processing import analyze

LIMITATIONS='Indicio estadístico de equiprobabilidad LSB, no prueba de esteganografía. Puede fallar con ruido, baja carga, LSB matching y otras técnicas. No analiza JPEG, metadatos ni cargas cifradas como tales.'
class AnalysisResult(BaseModel):
    model_config=ConfigDict(extra='ignore')
    analysis_id:str;user_id:str;filename:str;sha256:str;technique:str;indicators:dict
    created_at:str;status:str;action:str;limitations:str

class ApiError(BaseModel):
    detail: str


class RecordedAnalysisError(AnalysisResult):
    detail: str


class ServiceHealth(BaseModel):
    status: str
    service: str


def api_error(description):
    return {'description': description, 'model': ApiError}


AUTHORIZATION_ERRORS = {
    401: api_error('JWT o sesión inválidos'),
    403: api_error('No tiene permiso sobre la operación o el recurso'),
    502: api_error('AUTH devolvió una decisión no verificable'),
    503: api_error('AUTH no pudo proporcionar una decisión'),
    500: api_error('Error interno'),
}


def upload_error(description):
    return {'description': description, 'model': ApiError | RecordedAnalysisError}


class Gate:
    def __init__(self,app,service):self.app=app;self.service=service
    async def __call__(self,scope,receive,send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        service=self.service;path=scope['path'];method=scope['method'];state=scope.setdefault('state',{})
        headers=scope.get('headers',[]);given=next((v.decode('latin1') for k,v in headers if k==b'x-request-id'),'')
        identifier=given if re.fullmatch(r'[A-Za-z0-9._-]{1,64}',given) else str(uuid4())
        state['request_id']=identifier;code=500;route='unmatched';started=False
        async def logged_send(message):
            nonlocal code,started
            if message['type']=='http.response.start':
                started=True;code=message['status'];message.setdefault('headers',[]).extend([(b'x-request-id',identifier.encode()),(b'x-content-type-options',b'nosniff'),(b'cache-control',b'no-store')])
            await send(message)
        try:
            if path.rstrip('/')=='/api/v1/steganography/analyze' and method=='POST':
                route='/api/v1/steganography/analyze'
                token,subject=service.state.security.identify(headers);state['user_id']=subject
                await service.state.security.authorize(token,subject,'steganography.analyze',request_id=identifier)
            elif path.startswith('/api/v1/steganography/results/') and method=='GET':
                route='/api/v1/steganography/results/:id'
                token,subject=service.state.security.identify(headers);state['user_id']=subject
                try:resource=str(UUID(path.rstrip('/').split('/')[-1],version=4))
                except ValueError:raise HTTPException(400,'Identificador de análisis inválido') from None
                record=service.state.store.get(resource)
                # El propietario solo sale de nuestra BD; no de campos enviados por el usuario.
                await service.state.security.authorize(token,subject,'steganography.results.read',resource,record['user_id'] if record else subject,identifier)
                state['record']=record;state['analysis_id']=resource
            max_body=service.state.settings.max_file_bytes+65536
            size_header=[v for k,v in headers if k==b'content-length']
            if len(size_header)>1:raise HTTPException(400,'Content-Length inválido')
            if size_header:
                try:declared=int(size_header[0])
                except ValueError:raise HTTPException(400,'Content-Length inválido') from None
                if declared<0:raise HTTPException(400,'Content-Length inválido')
                if declared>max_body:raise HTTPException(413,'Carga excesiva')
            count=0
            async def limited_receive():
                nonlocal count
                message=await receive()
                if message['type']=='http.request':
                    count+=len(message.get('body',b''))
                    if count>max_body:raise HTTPException(413,'Carga excesiva')
                return message
            await self.app(scope,limited_receive,logged_send)
        except HTTPException as error:
            if started:return
            await JSONResponse({'detail':error.detail},status_code=error.status_code,headers=error.headers)(scope,receive,logged_send)
        except Exception:
            logging.getLogger('stego').error('Fallo interno request_id=%s',identifier)
            if started:return
            await JSONResponse({'detail':'Error interno'},status_code=500)(scope,receive,logged_send)
        finally:
            if route!='unmatched':
                try:service.state.store.audit(identifier,state.get('user_id'),method,route,code,state.get('analysis_id'))
                except Exception:logging.getLogger('stego').error('Auditoría no disponible request_id=%s',identifier)

def create_app(settings=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.settings=settings or Settings()
        app.state.store=Store(app.state.settings.data_dir)
        app.state.security=Security(app.state.settings)
        app.state.jobs=asyncio.Semaphore(app.state.settings.max_jobs)
        async def purge():
            while True:
                app.state.store.purge();await asyncio.sleep(60)
        task=asyncio.create_task(purge())
        try:yield
        finally:
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass
            await app.state.security.client.aclose()
    app=FastAPI(title='STEGO Backend V1',version='1.0.0',lifespan=lifespan)
    app.add_middleware(Gate,service=app)
    @app.get('/health', response_model=ServiceHealth)
    async def health():return {'status':'ok','service':'stego'}
    @app.post(
        '/api/v1/steganography/analyze',
        response_model=AnalysisResult,
        responses={
            **AUTHORIZATION_ERRORS,
            400: upload_error('Formulario inválido o PNG corrupto'),
            413: upload_error('Carga o dimensiones excesivas'),
            415: upload_error('Formato no admitido'),
            503: upload_error('AUTH, capacidad o procesamiento no disponibles'),
        },
        openapi_extra={
            'security': [{'BearerAuth': []}],
            'requestBody': {
                'required': True,
                'content': {'multipart/form-data': {'schema': {
                    'type': 'object', 'required': ['file'],
                    'properties': {'file': {'type': 'string', 'format': 'binary'}},
                }}},
            },
        },
    )
    async def upload(request:Request):
        settings=app.state.settings
        try:await asyncio.wait_for(app.state.jobs.acquire(),timeout=0.01)
        except asyncio.TimeoutError:raise HTTPException(503,'Capacidad de análisis ocupada') from None
        path=None
        try:
            if not request.headers.get('content-type','').lower().startswith('multipart/form-data'):raise HTTPException(415,'Se requiere multipart/form-data')
            try:form=await request.form(max_files=1,max_fields=0,max_part_size=settings.max_file_bytes)
            except Exception as error:
                if isinstance(error,HTTPException):raise
                raise HTTPException(400,'Formulario multipart inválido') from None
            try:
                file=form.get('file')
                from starlette.datastructures import UploadFile
                if len(form.multi_items())!=1 or not isinstance(file,UploadFile):raise HTTPException(400,'Enviar exactamente un archivo en file')
                name=(file.filename or '').replace('\\','/').split('/')[-1]
                name=re.sub(r'[^A-Za-z0-9._-]','_',name)[:100]
                if not name.lower().endswith('.png') or file.content_type!='image/png':raise HTTPException(415,'Solo PNG con tipo image/png')
                content=await file.read(settings.max_file_bytes+1)
            finally:
                await form.close()
            if len(content)>settings.max_file_bytes:raise HTTPException(413,'Archivo excesivo')
            if not content.startswith(b'\x89PNG\r\n\x1a\n'):raise HTTPException(415,'Firma de archivo no PNG')
            identifier=str(uuid4());request.state.analysis_id=identifier
            path=app.state.store.root/'quarantine'/(identifier+'.bin')
            with path.open('xb') as out:out.write(content)
            os.chmod(path,0o600)
            output=await analyze(path,settings)
            result={'analysis_id':identifier,'user_id':request.state.user_id,'filename':name,'sha256':hashlib.sha256(content).hexdigest(),'technique':'pov_pearson_lsb_png8_v1','indicators':output['indicators'],'created_at':datetime.now(timezone.utc).isoformat(),'status':output['status'],'action':'advertencia' if output['status']=='sin_indicios' else 'cuarentena','limitations':LIMITATIONS}
            retained=path.name if result['action']=='cuarentena' else None
            app.state.store.insert(result,retained,settings.quarantine_days)
            if retained:path=None
            if output['http_status']!=200:return JSONResponse({**result,'detail':output.get('error','Error de análisis')},status_code=output['http_status'])
            return result
        finally:
            if path is not None:path.unlink(missing_ok=True)
            app.state.jobs.release()
    @app.get(
        '/api/v1/steganography/results/{analysis_id}',
        response_model=AnalysisResult,
        responses={
            **AUTHORIZATION_ERRORS,
            400: api_error('Identificador de análisis inválido'),
            404: api_error('Análisis no encontrado'),
        },
        openapi_extra={'security': [{'BearerAuth': []}]},
    )
    async def result(analysis_id:str,request:Request):
        row=request.state.record
        if row is None:raise HTTPException(404,'Análisis no encontrado')
        return row
    original=app.openapi
    def schema():
        doc=original();doc.setdefault('components',{}).setdefault('securitySchemes',{})['BearerAuth']={'type':'http','scheme':'bearer','bearerFormat':'JWT'}
        return doc
    app.openapi=schema
    return app

app=create_app()

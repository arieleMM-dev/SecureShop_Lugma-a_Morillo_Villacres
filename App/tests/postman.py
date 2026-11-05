import copy
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import httpx
import ssl
from dotenv import dotenv_values

from integration import service_port

app = Path(__file__).resolve().parents[1]
workspace = app.parent
source = app / 'docs/pruebas/backend-v1.postman_collection.json'
samples = app / 'docs/pruebas/muestras'
executable = shutil.which('postman')
if not executable:
    raise SystemExit('Instalar Postman CLI para usar --postman. La suite normal no lo requiere.')
cli = Path(executable)
def verify_postman(auth_port, stego_port, directory):
    d=json.loads(source.read_text(encoding='utf-8'))
    auth,stego=d['item']
    originals={item['name']:item for folder in d['item'] for item in folder['item']}
    env_values={
        'base_url':f'https://localhost:{auth_port}/api/v1',
        'stego_url':f'http://127.0.0.1:{stego_port}',
        'seed_password':dotenv_values(app/'ms-users/.env')['SEED_PASSWORD'],
    }
    envfile=Path(directory)/'local.postman_environment.json'
    envfile.write_text(json.dumps({'name':'Prueba aislada','_postman_variable_scope':'environment','values':[{'key':k,'value':v,'enabled':True} for k,v in env_values.items()]}),encoding='utf-8')
    def expected(name,label,code,token='default',filename='default',user=None,checks=(),raw=None,url=None):
        req=copy.deepcopy(originals[name])
        req['name']=label
        headers=req['request'].setdefault('header',[])
        if token!='default':
            headers[:]=[h for h in headers if h['key'].lower()!='authorization']
            if token is not None:headers.append({'key':'Authorization','value':'Bearer '+token})
        if filename is None:req['request'].pop('body',None)
        elif filename!='default':req['request']['body']['formdata'][0]['src']=filename
        if user:
            body=json.loads(req['request']['body']['raw']);body['identifier']=user
            req['request']['body']['raw']=json.dumps(body)
        if raw is not None:req['request']['body']['raw']=json.dumps(raw)
        if url is not None:req['request']['url']=url
        req.setdefault('event',[]).append({'listen':'test','script':{'type':'text/javascript','exec':[f"pm.test('HTTP {code}', () => pm.response.to.have.status({code}));",*checks]}})
        return req
    d['item']=[
      expected('Health','Salud AUTH',200),
      expected('Login ADMIN','Login de administrador',200),
      expected('Listar roles','Roles con el token de administrador',200),
      expected('Crear rol','Datos de rol inválidos',400,raw={},checks=["pm.test('Error JSON tipado', () => pm.expect(pm.response.json().statusCode).to.equal(400));"]),
      expected('Crear rol','Crear un rol',201,checks=["pm.test('Rol devuelto', () => pm.expect(pm.response.json().rol).to.equal('SUPERVISOR'));","pm.collectionVariables.set('role_id', pm.response.json().id);"]),
      expected('Eliminar rol','Eliminar rol con cuerpo vacío',204,checks=["pm.test('Sin cuerpo', () => pm.expect(pm.response.text()).to.equal(''));"]),
      expected('Login de prueba','Login amendoza',200,user='amendoza',checks=["pm.test('JWT del analista guardado', () => pm.expect(pm.collectionVariables.get('analyst_token')).to.be.a('string').and.not.be.empty);"]),
      expected('Analizar imagen','Análisis del PNG por defecto',200,checks=["pm.test('Control sin indicios', () => pm.expect(pm.response.json().status).to.equal('sin_indicios'));"]),
      expected('Analizar imagen','Análisis de carga LSB',200,filename='oculta_lsb.png',checks=["pm.test('Carga detectada', () => pm.expect(pm.response.json().status).to.equal('sospechoso'));"]),
      expected('Consultar resultado','Consulta del propietario',200),
      expected('Login de prueba','Login cvega',200,user='cvega'),
      expected('Consultar resultado','Consulta ajena denegada',403,token='{{other_analyst_token}}'),
      expected('Consultar resultado','Consulta de ADMIN',200,token='{{access_token}}'),
      expected('Consultar resultado','ID inválido devuelve 400',400,url='{{stego_url}}/api/v1/steganography/results/no-es-uuid',checks=["pm.test('Error JSON detail', () => pm.expect(pm.response.json().detail).to.be.a('string'));"]),
      expected('Consultar resultado','Resultado inexistente devuelve 404',404,url='{{stego_url}}/api/v1/steganography/results/11111111-1111-4111-8111-111111111111'),
      expected('Login de prueba','Login mgomez',200,user='mgomez'),
      expected('Analizar imagen','USER con PNG',403,token='{{user_token}}'),
      expected('Analizar imagen','Sin JWT con PNG',401,token=None),
      expected('Analizar imagen','JWT inválido con PNG',401,token='token-invalido'),
      expected('Analizar imagen','USER sin archivo',403,token='{{user_token}}',filename=None),
      expected('Analizar imagen','Sin JWT ni archivo',401,token=None,filename=None),
      expected('Analizar imagen','ADMIN puede analizar el mismo PNG',200,token='{{access_token}}',checks=["pm.test('El resultado pertenece a ADMIN', () => pm.expect(pm.response.json().user_id).to.be.a('string'));"]),
    ]
    test=Path(directory)/'verificacion.postman_collection.json'
    test.write_text(json.dumps(d,ensure_ascii=False),encoding='utf-8')
    ca=ssl.create_default_context(cafile=str(app/'ms-users/secrets/ca.crt'))
    with httpx.Client(verify=ca,trust_env=False,follow_redirects=True,timeout=10) as client:
        for url,file in [
            (f'https://localhost:{auth_port}/docs-json','openapi-auth.json'),
            (f'http://127.0.0.1:{stego_port}/openapi.json','openapi-stego.json'),
        ]:
            response=client.get(url)
            assert response.status_code==200,(file,response.status_code)
            expected_contract=json.loads((app/'docs/contratos'/file).read_text(encoding='utf-8'))
            assert response.json()==expected_contract,file
        for url in [f'https://localhost:{auth_port}/docs',f'http://127.0.0.1:{stego_port}/docs']:
            swagger=client.get(url)
            assert swagger.status_code==200 and 'swagger-ui' in swagger.text.lower(),url
    print('Swagger y OpenAPI exportado coinciden para AUTH y STEGO.',flush=True)
    flags=['-e',str(envfile),'--working-dir',str(samples),'--no-insecure-file-read','--ssl-extra-ca-certs',str(app/'ms-users/secrets/ca.crt'),'--no-report-events','--bail','--timeout','65000','--timeout-request','12000','--disable-unicode']
    subprocess.run([str(cli),'collection','run',str(test),*flags],cwd=samples,check=True)
    return flags

def verify_native(flags, directory):
    local=Path(directory)/'postman'
    import shutil
    shutil.copytree(workspace/'postman',local)
    native=local/'collections/Backend V1 AUTH + STEGO'
    subprocess.run([str(cli),'collection','run',str(native),'-i','Login de prueba','-i','Analizar imagen','-i','Consultar resultado',*flags],cwd=samples,check=True)
def main():
    with tempfile.TemporaryDirectory(prefix='postman-verificacion-') as directory:
        flags = verify_postman(service_port('auth',3443),service_port('stego',8000),directory)
        native = workspace / 'postman/collections/Backend V1 AUTH + STEGO'
        if native.is_dir():
            verify_native(flags,directory)


if __name__ == '__main__':
    main()

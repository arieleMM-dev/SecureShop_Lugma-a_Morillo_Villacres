import ssl
from uuid import UUID
from pathlib import Path
import httpx
import jwt
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey

class Decision(BaseModel):
    model_config=ConfigDict(extra='forbid', strict=True)
    subject_id: str
    action: str
    resource_id: str | None
    allowed: StrictBool
    reason: str

class Security:
    def __init__(self, settings):
        self.settings=settings
        self.public_key=Path(settings.auth_public_key_path).read_bytes()
        key=load_pem_public_key(self.public_key)
        if not isinstance(key,RSAPublicKey) or key.key_size<3072:raise ValueError('Se requiere clave pública RSA >=3072 bits')
        ctx=ssl.create_default_context(cafile=str(settings.auth_ca_path));ctx.minimum_version=ssl.TLSVersion.TLSv1_3
        self.client=httpx.AsyncClient(base_url=settings.auth_base_url,verify=ctx,timeout=settings.auth_timeout,follow_redirects=False,trust_env=False,limits=httpx.Limits(max_connections=8,max_keepalive_connections=4))
    def identify(self, headers):
        values=[value.decode('latin1') for key,value in headers if key.lower()==b'authorization']
        if len(values)!=1 or len(values[0])>8192:raise HTTPException(401,'Se requiere un JWT Bearer',headers={'WWW-Authenticate':'Bearer'})
        pieces=values[0].split()
        if len(pieces)!=2 or pieces[0].lower()!='bearer':raise HTTPException(401,'Se requiere un JWT Bearer')
        try:
            token=pieces[1]
            payload=jwt.decode(token,self.public_key,algorithms=['RS256'],issuer=self.settings.auth_jwt_issuer,audience=self.settings.auth_jwt_audience,options={'require':['sub','exp','iat','iss','aud','typ','tokenVersion']})
            if str(UUID(payload['sub'],version=4))!=payload['sub'] or payload['typ']!='access' or type(payload['tokenVersion']) is not int or payload['tokenVersion']<0 or type(payload['exp']) is not int or type(payload['iat']) is not int or not 60<=payload['exp']-payload['iat']<=3600:raise ValueError()
            return token,payload['sub']
        except (jwt.PyJWTError,ValueError,TypeError,KeyError):raise HTTPException(401,'Token inválido o expirado',headers={'WWW-Authenticate':'Bearer'}) from None
    async def authorize(self, token, subject, action, resource_id=None, owner=None, request_id=''):
        body={'subject_token':token,'action':action,'resource_id':resource_id}
        if owner is not None:body['resource_owner_id']=owner
        try:
            response=await self.client.post('/internal/authorization/check',json=body,headers={'X-Service-Token':self.settings.auth_service_token,'X-Request-Id':request_id})
        except httpx.HTTPError:raise HTTPException(503,'No se pudo comprobar la autorización vigente') from None
        if response.status_code==401:raise HTTPException(401,'Token o sesión no autorizados')
        if response.status_code!=200:raise HTTPException(503,'AUTH no proporcionó una decisión válida')
        try:
            decision=Decision.model_validate(response.json())
            if decision.subject_id!=subject or decision.action!=action or decision.resource_id!=resource_id or decision.reason!=('active_role_grants_permission' if decision.allowed else 'active_role_does_not_grant_permission'):raise ValueError()
        except (ValueError,TypeError):raise HTTPException(502,'Respuesta de autorización no verificable') from None
        if not decision.allowed:raise HTTPException(403,'No posee permiso para esta operación')

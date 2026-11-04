# TALLER JWTS

# 1. Política de autorización

Para esta primera versión se propone la siguiente política:

| Recurso | Operación | ADMIN | OPERADOR | CLIENTE |
|---|---|---|---|---|
| Products | Listar/consultar | ✅ | ✅ | ✅ |
| Products | Crear | ✅ | ✅ | ❌ |
| Products | Actualizar | ✅ | ✅ | ❌ |
| Products | Eliminar | ✅ | ❌ | ❌ |
| Categories | Listar/consultar | ✅ | ✅ | ✅ |
| Categories | Crear | ✅ | ❌ | ❌ |
| Categories | Actualizar | ✅ | ❌ | ❌ |
| Categories | Eliminar | ✅ | ❌ | ❌ |
| Product Categories | Consultar | ✅ | ✅ | ✅ |
| Product Categories | Asignar | ✅ | ✅ | ❌ |
| Product Categories | Actualizar | ✅ | ✅ | ❌ |
| Product Categories | Eliminar | ✅ | ✅ | ❌ |

Estos nombres son políticas del endpoint. Los roles reales del usuario continúan saliendo de:

```text
roles
   ▲
   │
user_roles
   ▲
   │
 users
```

# 2. Verificar primero User Service

El User Service debe tener funcionando:

```http
POST http://localhost:3001/api/v1/auth/login
```

y:

```http
GET http://localhost:3001/api/v1/auth/me
Authorization: Bearer TOKEN
```

Por ejemplo, después de iniciar sesión como:

```json
{
  "identifier": "jperez",
  "password": "ClaveSegura2026!"
}
```

se obtiene:

```json
{
  "accessToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "UUID",
    "username": "jperez",
    "email": "jperez@example.com",
    "roles": [
      "ADMIN"
    ]
  }
}
```

Luego:

```http
GET /api/v1/auth/me
Authorization: Bearer eyJhbGciOi...
```

debe devolver:

```json
{
  "userId": "UUID",
  "username": "jperez",
  "email": "jperez@example.com",
  "roles": [
    "ADMIN"
  ]
}
```

Este endpoint será el contrato entre User Service y Product Service.

# 3. Instalar HTTPX en Product Service

Se debe activar el entorno:

```powershell
.venv\Scripts\Activate.ps1
```

Instalar:

```bash
pip install httpx
```

Actualizar:

```bash
pip freeze > requirements.txt
```

Se utilizará un único `httpx.AsyncClient` compartido porque HTTPX reutiliza conexiones mediante *connection pooling*; crear un cliente nuevo para cada petición produciría conexiones TCP innecesarias.

# 4. Estructura que se agregará

Se conserva la estructura actual y se añade:

```text
app/
│
├── api/
│   ├── deps.py
│   └── v1/
│       └── endpoints/
│           ├── products.py
│           ├── categories.py
│           └── product_categories.py
│
├── clients/
│   ├── __init__.py
│   └── user_service.py          NUEVO
│
├── security/
│   ├── __init__.py
│   ├── dependencies.py         NUEVO
│   └── roles.py                NUEVO
│
├── schemas/
│   ├── auth.py                 NUEVO
│   ├── product.py
│   ├── category.py
│   └── product_category.py
│
├── core/
│   └── config.py
│
├── db/
│   ├── seed.py
│   ├── init_db.py
│   └── session.py
│
└── main.py
```

# 5. Configurar dirección de User Service

Se debe agregar al archivo `.env`:

```env
USER_SERVICE_URL=http://127.0.0.1:3001
USER_SERVICE_AUTH_ME_PATH=/api/v1/auth/me
USER_SERVICE_TIMEOUT_SECONDS=3.0
```

El `.env` puede quedar así:

```env
APP_NAME=product-service
APP_VERSION=1.0.0
API_V1_STR=/api/v1

ENABLE_SEED=true

DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=product_db
DB_USER=product_user
DB_PASSWORD=Product_DB_2026.Change.This.Password

USER_SERVICE_URL=http://127.0.0.1:3001
USER_SERVICE_AUTH_ME_PATH=/api/v1/auth/me
USER_SERVICE_TIMEOUT_SECONDS=3.0
```

No es necesario definir:

```env
JWT_SECRET
```

en Product Service. Eso es intencional.

# 6. Modificar config.py

En `app/core/config.py`:

```python
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    APP_NAME: str = "product-service"
    APP_VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENABLE_SEED: bool = False

    # ==========================================
    # PostgreSQL
    # ==========================================
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str

    # ==========================================
    # User Service
    # ==========================================
    USER_SERVICE_URL: str = (
        "http://127.0.0.1:3001"
    )
    USER_SERVICE_AUTH_ME_PATH: str = (
        "/api/v1/auth/me"
    )
    USER_SERVICE_TIMEOUT_SECONDS: float = 3.0

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
    )

    @property
    def DATABASE_URL(self) -> str:
        ...
```

# 7. Crear schema del usuario autenticado

Se debe crear `app/schemas/auth.py`:

```python
from uuid import UUID

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)


class AuthenticatedUser(BaseModel):
    userId: UUID
    username: str
    email: str
    roles: list[str] = Field(
        default_factory=list,
    )

    @field_validator("roles")
    @classmethod
    def normalize_roles(
        cls,
        values: list[str],
    ) -> list[str]:
        return sorted(
            {
                role
                .strip()
                .upper()
                for role in values
                if role.strip()
            }
        )
```

Este objeto representa exactamente lo que se recibirá de:

```text
User Service /auth/me
```

# 8. Crear las políticas de roles

Se debe crear `app/security/roles.py`:

```python
ROLE_ADMIN = "ADMIN"
ROLE_OPERATOR = "OPERADOR"
ROLE_CLIENT = "CLIENTE"

# Todos los usuarios autenticados
READ_ROLES = (
    ROLE_ADMIN,
    ROLE_OPERATOR,
    ROLE_CLIENT,
)

# Gestión de productos
PRODUCT_WRITE_ROLES = (
    ROLE_ADMIN,
    ROLE_OPERATOR,
)

# Gestión de relaciones producto-categoría
PRODUCT_CATEGORY_WRITE_ROLES = (
    ROLE_ADMIN,
    ROLE_OPERATOR,
)

# Operaciones administrativas
ADMIN_ONLY = (
    ROLE_ADMIN,
)
```

Esto no sustituye la tabla `roles`. Solamente expresa cosas como:

```text
Para crear productos acepto:
ADMIN OR OPERADOR
```

Después se verificará si el usuario posee realmente esos roles consultando User Service.

# 9. Crear cliente para User Service

Se debe crear `app/clients/user_service.py`:

```python
import httpx
from fastapi import (
    HTTPException,
    status,
)
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.auth import AuthenticatedUser


async def validate_user_token(
    client: httpx.AsyncClient,
    token: str,
    request_id: str | None = None,
) -> AuthenticatedUser:
    headers = {
        "Authorization": (
            f"Bearer {token}"
        ),
    }

    if request_id:
        headers["X-Request-Id"] = (
            request_id[:64]
        )

    try:
        response = await client.get(
            settings.USER_SERVICE_AUTH_ME_PATH,
            headers=headers,
        )
        ...
```

# 10. Crear la dependencia de autenticación

Se debe crear `app/security/dependencies.py`:

```python
from collections.abc import Callable

from fastapi import (
    Depends,
    HTTPException,
    Request,
    Security,
    status,
)
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)

from app.clients.user_service import (
    validate_user_token,
)
from app.schemas.auth import (
    AuthenticatedUser,
)

# ============================================
# Bearer JWT
# ============================================
bearer_scheme = HTTPBearer(
    scheme_name="BearerAuth",
    bearerFormat="JWT",
    description=(
        "JWT generado por User Service"
    ),
    auto_error=False,
)
```

FastAPI está pensado precisamente para usar dependencias y subdependencias para lógica compartida de autenticación, permisos y roles, evitando repetirla en cada endpoint; además, las dependencias de seguridad se incorporan a OpenAPI/Swagger.

# 11. Modificar el lifespan de FastAPI

El `main.py` actual ya contiene:

```python
init_db()
seed_database()
```

Ahora se agregará un único `AsyncClient`.

En `app/main.py`:

```python
from contextlib import (
    asynccontextmanager,
)

import httpx
from fastapi import FastAPI

from app.api.v1.api import (
    api_router,
)
from app.core.config import (
    settings,
)
from app.db.init_db import (
    init_db,
)
from app.db.seed import (
    seed_database,
)


@asynccontextmanager
async def lifespan(
    app: FastAPI,
):
    print(
        "🚀 Iniciando Product Service..."
    )

    # ========================================
    # Base de datos
    # ========================================
    init_db()

    if settings.ENABLE_SEED:
        ...
```

El timeout es deliberadamente corto: una dependencia de autenticación remota no debería dejar las peticiones suspendidas indefinidamente. HTTPX admite timeouts separados de conexión, lectura, escritura y pool.

# 12. Proteger Products

Se debe modificar `app/api/v1/endpoints/products.py`.

**Imports nuevos:**

```python
from app.schemas.auth import (
    AuthenticatedUser,
)
from app.security.dependencies import (
    require_roles,
)
from app.security.roles import (
    ADMIN_ONLY,
    PRODUCT_WRITE_ROLES,
    READ_ROLES,
)
```

El archivo completo puede quedar así:

```python
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.exc import (
    IntegrityError,
)
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.product import (
    create_product,
    delete_product,
    get_product,
    get_products,
    update_product,
)
from app.schemas.auth import (
    AuthenticatedUser,
)
from app.schemas.product import (
    ProductCreate,
    ProductRead,
    ProductUpdate,
)
from app.security.dependencies import (
    require_roles,
)
```

# 13. Proteger Categories

La política será:

```text
GET       → ADMIN / OPERADOR / CLIENTE
POST      → ADMIN
PATCH     → ADMIN
DELETE    → ADMIN
```

En `app/api/v1/endpoints/categories.py` se debe agregar:

```python
from app.schemas.auth import (
    AuthenticatedUser,
)
from app.security.dependencies import (
    require_roles,
)
from app.security.roles import (
    ADMIN_ONLY,
    READ_ROLES,
)
```

**Crear categoría:**

```python
@router.post(
    "/",
    response_model=CategoryRead,
    status_code=(
        status.HTTP_201_CREATED
    ),
)
def create_category_endpoint(
    payload: CategoryCreate,
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *ADMIN_ONLY
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    try:
        return create_category(
            db,
            payload,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            ...
        )
```

**Listar:**

```python
@router.get(
    "/",
    response_model=list[CategoryRead],
)
def list_categories_endpoint(
    page: int = Query(
        1,
        ge=1,
    ),
    limit: int = Query(
        20,
        ge=1,
        le=100,
    ),
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *READ_ROLES
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    skip = (page - 1) * limit
    ...
```

**Consultar:**

```python
@router.get(
    "/{category_id}",
    response_model=CategoryRead,
)
def get_category_endpoint(
    category_id: UUID,
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *READ_ROLES
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    db_obj = get_category(
        db,
        category_id,
    )
    if not db_obj:
        raise HTTPException(
            status_code=404,
            detail=(
                "Categoría no encontrada"
            ),
        )
    ...
```

**Actualizar y eliminar:**

```python
@router.patch(
    "/{category_id}",
    response_model=CategoryRead,
)
def update_category_endpoint(
    category_id: UUID,
    payload: CategoryUpdate,
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *ADMIN_ONLY
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    ...


@router.delete(
    "/{category_id}",
    response_model=CategoryRead,
)
def delete_category_endpoint(
    category_id: UUID,
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *ADMIN_ONLY
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    ...
```

La lógica CRUD existente no cambia.

# 14. Proteger ProductCategory

Política:

```text
GET       ADMIN / OPERADOR / CLIENTE
POST      ADMIN / OPERADOR
PATCH     ADMIN / OPERADOR
DELETE    ADMIN / OPERADOR
```

En `app/api/v1/endpoints/product_categories.py` se debe agregar:

```python
from app.schemas.auth import (
    AuthenticatedUser,
)
from app.security.dependencies import (
    require_roles,
)
from app.security.roles import (
    PRODUCT_CATEGORY_WRITE_ROLES,
    READ_ROLES,
)
```

**Crear relación:**

```python
@router.post(
    "/",
    response_model=ProductCategoryRead,
    status_code=(
        status.HTTP_201_CREATED
    ),
)
def create_product_category_endpoint(
    payload: ProductCategoryCreate,
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *PRODUCT_CATEGORY_WRITE_ROLES
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    product = get_product(
        db,
        payload.product_id,
    )
    if not product:
        raise HTTPException(
            status_code=404,
            ...
        )
```

**Lista:**

```python
@router.get(
    "/",
    response_model=list[ProductCategoryRead],
)
def list_product_categories_endpoint(
    page: int = Query(
        1,
        ge=1,
    ),
    limit: int = Query(
        20,
        ge=1,
        le=100,
    ),
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *READ_ROLES
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    skip = (page - 1) * limit
    ...
```

**Categorías de un producto:**

```python
@router.get(
    "/by-product/{product_id}",
    response_model=list[ProductCategoryRead],
)
def get_categories_of_product_endpoint(
    product_id: UUID,
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *READ_ROLES
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    product = get_product(
        db,
        product_id,
    )
    if not product:
        raise HTTPException(
            status_code=404,
            detail=(
                "Producto no encontrado"
            ),
        )
    ...
```

**Productos de una categoría:**

```python
@router.get(
    "/by-category/{category_id}",
    response_model=list[ProductCategoryRead],
)
def get_products_of_category_endpoint(
    category_id: UUID,
    _current_user: AuthenticatedUser = Depends(
        require_roles(
            *READ_ROLES
        )
    ),
    db: Session = Depends(
        get_db
    ),
):
    category = get_category(
        db,
        category_id,
    )
    if not category:
        raise HTTPException(
            status_code=404,
            detail=(
                "Categoría no encontrada"
            ),
        )
    ...
```

Para PATCH y DELETE se debe usar:

```python
_current_user: AuthenticatedUser = Depends(
    require_roles(
        *PRODUCT_CATEGORY_WRITE_ROLES
    )
),
```

# 15. ¿Qué ocurre ahora en cada petición?

Por ejemplo:

```http
GET http://localhost:8000/api/v1/products/
Authorization: Bearer TOKEN
```

FastAPI ejecuta primero:

```text
require_roles()
       │
       ▼
get_current_user()
       │
       ▼
HTTPBearer
       │
       ▼
extrae TOKEN
       │
       ▼
User Service
GET /api/v1/auth/me
       │
       ▼
JwtAuthGuard
       │
       ▼
JwtStrategy
       │
       ├── JWT válido
       ├── tokenVersion válido
       ├── usuario activo
       │
       ▼
users → user_roles → roles
       │
       ▼
["CLIENTE"]
       │
       ▼
Product Service
       │
       ▼
¿CLIENTE ∈ READ_ROLES?
       │
       ▼
      SÍ
       │
       ▼
get_products()
```

# 16. Probar con ADMIN

Primero se debe iniciar sesión en User Service:

```http
POST http://localhost:3001/api/v1/auth/login
Content-Type: application/json

{
  "identifier": "jperez",
  "password": "ClaveSegura2026!"
}
```

Copiar el valor de:

```text
accessToken
```

Ahora en Product Service:

```http
GET http://localhost:8000/api/v1/products/
Authorization: Bearer TOKEN_ADMIN
```

Resultado:

```text
200 OK
```

Crear:

```http
POST http://localhost:8000/api/v1/products/
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json

{
  "sku": "PROD-100",
  "nombre": "Monitor LG",
  "descripcion": "Monitor IPS de 27 pulgadas",
  "marca": "LG",
  "precio_venta": 249.99,
  "stock": 10,
  "stock_minimo": 2,
  "estado": true
}
```

Resultado:

```text
201 Created
```

# 17. Probar con OPERADOR

Login:

```json
{
  "identifier": "amendoza",
  "password": "ClaveSegura2026!"
}
```

El User Service devolverá desde las tablas:

```json
{
  "roles": [
    "OPERADOR"
  ]
}
```

Con ese token:

```http
GET /api/v1/products/
```

Resultado:

```text
200 OK
```

Crear producto:

```http
POST /api/v1/products/
```

Resultado:

```text
201 Created
```

Pero:

```http
DELETE /api/v1/products/{id}
```

Resultado:

```text
403 Forbidden
```

porque se definió:

```python
ADMIN_ONLY = (
    "ADMIN",
)
```

para eliminar.

# 18. Probar con CLIENTE

Login:

```json
{
  "identifier": "mgomez",
  "password": "ClaveSegura2026!"
}
```

Consultar:

```http
GET /api/v1/products/
Authorization: Bearer TOKEN_CLIENTE
```

Resultado:

```text
200 OK
```

Intentar crear:

```http
POST /api/v1/products/
Authorization: Bearer TOKEN_CLIENTE
```

Resultado:

```text
403 Forbidden
```

Porque Product Service recibe:

```json
{
  "roles": [
    "CLIENTE"
  ]
}
```

y el endpoint requiere:

```text
ADMIN OR OPERADOR
```

# 19. Qué sucede sin JWT

```http
GET /api/v1/products/
```

Respuesta:

```text
401 Unauthorized
```

Por ejemplo:

```json
{
  "detail": "Se requiere un token de acceso"
}
```

# 20. Qué sucede con JWT inválido

```http
Authorization: Bearer token_inventado
```

Product Service envía ese token a User Service.

User Service responde:

```text
401
```

Product Service devuelve:

```json
{
  "detail": "Token inválido o sesión expirada"
}
```

# 21. El logout funciona también entre microservicios

Este es un beneficio importante de este diseño.

Supongamos que `jperez` tiene:

```text
token_version = 0
```

y obtiene un JWT.

Puede usar:

```http
GET product-service/api/v1/products/
```

Luego ejecuta:

```http
POST http://localhost:3001/api/v1/auth/logout
Authorization: Bearer TOKEN
```

User Service hace:

```text
token_version = 1
```

Si intenta reutilizar el token en Product Service:

```http
GET http://localhost:8000/api/v1/products/
Authorization: Bearer TOKEN_ANTERIOR
```

el flujo será:

```text
Product Service
      │
      ▼
User Service /auth/me
      │
      ▼
JWT.tokenVersion = 0

users.token_version = 1
      │
      ▼
401
```

Product Service responde:

```text
401 Unauthorized
```

Por tanto, la revocación es inmediata.

# 22. Swagger ahora tendrá autorización

En:

```text
http://localhost:8000/docs
```

FastAPI detectará:

```python
HTTPBearer(...)
```

y mostrará seguridad Bearer en los endpoints protegidos. Las utilidades de seguridad de FastAPI se integran automáticamente con OpenAPI.

Primero se debe obtener el token desde:

```text
http://localhost:3001/api/v1/auth/login
```

Luego, en el Swagger de Product Service, pulsar:

```text
Authorize
```

e ingresar el JWT.

Después se podrá probar:

- Products
- Categories
- Product Categories

con la identidad correspondiente.

# 23. Health continúa público

Esto:

```http
GET http://localhost:8000/health
```

no utiliza ninguna dependencia:

```python
@app.get("/health")
```

por tanto no requiere JWT.

Esto es conveniente para:

- Docker healthcheck
- Kubernetes probes
- monitorización
- balanceadores

# 24. Resumen de respuestas de seguridad

| Situación | HTTP |
|---|---|
| Sin JWT | 401 |
| JWT inválido | 401 |
| JWT expirado | 401 |
| JWT invalidado por logout | 401 |
| Usuario desactivado | 401 |
| Rol insuficiente | 403 |
| User Service caído | 503 |
| Timeout de User Service | 503 |
| Respuesta inesperada de User Service | 502 |
| Autorizado | Continúa al CRUD |

La regla importante es:

```text
401 = no está autenticado

403 = está autenticado,
      pero no tiene permiso
```

# 25. No se necesita CORS entre microservicios

La llamada:

```text
Product Service
        ↓
User Service
```

es una comunicación servidor a servidor.

CORS es una restricción del navegador, por lo que Product Service no necesita que User Service habilite CORS para que HTTPX pueda llamar a `/auth/me`.

CORS sí será relevante posteriormente para:

```text
Frontend → Product Service
Frontend → User Service
```

# 26. Si los dos servicios corren localmente

La configuración actual sería:

```text
USER SERVICE
http://127.0.0.1:3001

PRODUCT SERVICE
http://127.0.0.1:8000
```

Entonces:

```env
USER_SERVICE_URL=http://127.0.0.1:3001
```

es correcto.

El PostgreSQL puede seguir ejecutándose mediante Docker; eso no afecta esta comunicación HTTP.

# 27. Si Product Service está en Docker pero User Service está en Windows

Aquí hay una diferencia importante.

Dentro de un contenedor:

```text
localhost
```

significa:

```text
el propio contenedor
```

No el host Windows.

Por tanto no se utilizaría:

```env
USER_SERVICE_URL=http://127.0.0.1:3001
```

sino, en Docker Desktop para Windows:

```env
USER_SERVICE_URL=http://host.docker.internal:3001
```

El flujo sería:

```text
Product container
       │
       ▼
host.docker.internal:3001
       │
       ▼
User Service ejecutándose
en Windows
```

# 28. Si posteriormente ambos microservicios están en Docker

Por ejemplo:

```yaml
services:

  user-service:
    container_name: user-service
    # ...

  product-service:
    container_name: product-service
    # ...
```

ambos en:

```yaml
networks:
  - microservices-network
```

Product Service utilizará:

```env
USER_SERVICE_URL=http://user-service:3001
```

No:

```env
localhost:3001
```

Docker resolverá:

```text
user-service
```

mediante DNS interno.

La arquitectura será:

```text
                 Docker Network
          ┌────────────────────────┐
          │                        │
          │    user-service        │
          │       :3001            │
          │        ▲               │
          │        │ HTTP          │
          │        │               │
          │    product-service     │
          │       :8000            │
          │                        │
          └────────────────────────┘
```

# 29. Atención con el Rate Limiting de User Service

En el User Service se implementó rate limiting global.

Ahora cada petición a Product Service genera internamente:

```http
GET /auth/me
```

Por ejemplo:

```text
1000 peticiones a Product Service
             │
             ▼
1000 llamadas a User Service /auth/me
```

Además, esas llamadas podrían llegar desde la misma IP del Product Service, no desde las IP individuales de los usuarios.

Por eso, para desarrollo se puede aumentar específicamente el límite de `/auth/me`.

En NestJS:

```typescript
@Get('me')
@Throttle({
  default: {
    limit: 1000,
    ttl: 60_000,
  },
})
me(
  @CurrentUser()
  user: AuthenticatedUser,
) {
  return user;
}
```

Posteriormente es mejor crear un endpoint interno específico como:

```text
/auth/introspect
```

para comunicación entre microservicios, protegido además a nivel de red o mediante autenticación servicio-a-servicio.

# 30. ¿Por qué no validar directamente el JWT en Product Service?

Se podría copiar:

```text
JWT_SECRET
```

a Product Service y validar localmente el token.

Pero en la arquitectura actual eso tiene dos problemas:

```text
User Service
JWT_SECRET
     │
     └────────► Product Service
```

El secreto queda compartido entre servicios.

Y además el JWT deliberadamente no contiene los roles como fuente de autorización.

Los roles reales están en:

```text
user_roles
+
roles
```

y la revocación de logout depende de:

```text
users.token_version
```

Por eso, aunque Product Service validara localmente la firma, todavía tendría que preguntar a User Service:

- ¿Está activo?
- ¿Cerró sesión?
- ¿Qué roles tiene ahora?

En el diseño actual es más limpio que:

```text
Product Service
       │
       ▼
User Service
       │
       ▼
valide todo
```

# 31. Seguridad por diseño

Con esta integración, Product Service falla cerrado.

Si User Service deja de responder:

```text
Product Service
        │
        X
User Service no disponible
```

no se hace:

```text
permitir acceso
```

sino:

```text
503 Service Unavailable
```

Esto evita que una falla del sistema de autenticación convierta accidentalmente endpoints protegidos en públicos.

Tampoco:

- se registran JWT en logs;
- se aceptan URLs de User Service desde parámetros del usuario;
- se comparte `JWT_SECRET`;
- se duplican tablas de usuarios;
- se duplican `user_roles`;
- se confía en un rol enviado por el cliente.

# 32. Flujo final completo

La arquitectura queda:

```text
                         LOGIN
                           │
                           ▼
┌──────────────────────────────────────────────┐
│                 USER SERVICE                 │
│                    NestJS                    │
│                                             │
│ POST /auth/login                            │
│                                             │
│ Argon2                                      │
│ JWT                                         │
│ PostgreSQL                                  │
│                                             │
│ users                                       │
│ roles                                       │
│ user_roles                                  │
└──────────────────────┬───────────────────────┘
                       │
                       │ JWT
                       ▼
                    CLIENTE
                       │
                       │ Authorization:
                       │ Bearer JWT
                       ▼
┌──────────────────────────────────────────────┐
│               PRODUCT SERVICE                │
│                   FastAPI                    │
│                                             │
│ HTTPBearer                                  │
│      │                                      │
│      ▼                                      │
│ get_current_user()                          │
└──────┬───────────────────────────────────────┘
       │
       │ JWT
       ▼
┌──────────────────────────────────────────────┐
│                 USER SERVICE                 │
│                                             │
│ GET /auth/me                                │
│                                             │
│ JwtAuthGuard                                │
│      ↓                                      │
│ JwtStrategy                                 │
│      ↓                                      │
│ users                                       │
│      ↓                                      │
│ user_roles                                  │
│      ↓                                      │
│ roles                                       │
└──────┬───────────────────────────────────────┘
       │
       │
       │ {
       │   userId,
       │   username,
       │   roles
       │ }
       ▼
┌──────────────────────────────────────────────┐
│               PRODUCT SERVICE                │
│                                             │
│ require_roles()                             │
│                                             │
│       ┌───────────────┐                     │
│       │               │                     │
│       ▼               ▼                     │
│ autorizado       no autorizado              │
│     │                  │                    │
│     ▼                  ▼                    │
│ CRUD                403                     │
│                                             │
│ Products                                    │
│ Categories                                  │
│ ProductCategories                           │
└──────────────────────────────────────────────┘
```

Con esto se logra una separación correcta de responsabilidades: User Service autentica, determina si la sesión sigue vigente y obtiene los roles desde `user_roles → roles`; Product Service únicamente declara qué roles necesita cada operación y ejecuta su lógica de productos/categorías cuando User Service confirma la autorización. Esta integración además conserva el logout mediante `tokenVersion`, porque cada llamada protegida vuelve a pasar por la validación de User Service.
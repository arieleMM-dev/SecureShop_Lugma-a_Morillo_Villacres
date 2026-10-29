# ms-users: usuarios, roles y autenticación

Implementación local de los talleres de [agcudco/ms-users-nestjs](https://github.com/agcudco/ms-users-nestjs), referencia `d5ed93d86455711ef193541dd3cedc0ed98ee317` (29/10/2026).

La carpeta de trabajo es `App/ms-users`. No hace falta fusionar los historiales de los repositorios ni mantener dos aplicaciones en ejecución. Las instrucciones originales están en `info/`; la correspondencia con la implementación y las diferencias están en [info/IMPLEMENTACION.md](info/IMPLEMENTACION.md).

## Arranque local

Requisitos: Node.js 24 o posterior compatible con las dependencias, npm y Docker Desktop iniciado. Ejecutar desde `App/ms-users`:

```sh
npm ci
npm run env:init
docker compose up -d postgres
npm run db:migrate
npm run seed
npm run start:dev
```

`env:init` crea `.env` a partir de `example.env.dist` si no existe. Genera secretos locales y completa claves ausentes; conserva los valores ya configurados. Revisar DB_* antes de iniciar Docker. `.env` se mantiene privado y no se versiona. Si el puerto 5432 está ocupado, seleccionar otro DB_PORT.

La migración inicial está preparada para una base nueva. Si ya existen tablas `users`, `roles` o `user_roles`, se detiene antes de modificarlas. En ese caso, respaldar y preparar una migración de adaptación según el esquema y los datos reales; no borrar tablas ni activar `synchronize` para forzarla. Cambiar DB_PASSWORD no cambia la contraseña de un volumen PostgreSQL previamente inicializado.

## Usuarios de demostración

La siembra crea ADMIN, CLIENTE y OPERADOR, cinco usuarios y seis asignaciones:

| Usuario | Roles |
|---|---|
| jperez | ADMIN |
| mgomez | CLIENTE |
| cvega | CLIENTE, OPERADOR |
| amendoza | OPERADOR |
| lcastro | CLIENTE |

La contraseña inicial está en `SEED_PASSWORD` de vuestro `.env`. No utilizar la contraseña fija ilustrativa de las guías originales. Repetir la siembra conserva las cuentas existentes y no restablece sus claves ni privilegios. La siembra de demostración está bloqueada en producción.

## Uso

- API: `http://localhost:3001/api/v1`.
- Estado público: `GET /api/v1/health`.
- Login: `POST /api/v1/auth/login`, con `identifier` (username o email) y `password`.
- Swagger: `http://localhost:3001/docs`, disponible fuera de producción. Pulsar Authorize y pegar el accessToken del login.
- Las demás rutas requieren `Authorization: Bearer <accessToken>`; los permisos coinciden con `info/endpoints.md`.
- El JWT identifica al usuario; los roles activos se consultan en PostgreSQL en cada petición. Logout incrementa `token_version` e invalida todos los tokens anteriores de esa cuenta.

`admin`, `Admin` y ` ADMIN ` recibidos por API se almacenan como `ADMIN`. La base exige nombres de rol canónicos en mayúsculas y tiene un índice UNIQUE: una escritura SQL directa con minúsculas se rechaza. Username y email se guardan en minúsculas. Una asignación usuario/rol repetida devuelve 409.

## Verificación

```sh
npm run build
npm test -- --runInBand
npm run lint
npm run test:docker
```

`test:docker` crea un contenedor PostgreSQL 18 temporal, con contraseña y puerto aleatorios, sin volúmenes. Ejecuta las pruebas de integración en una base nueva y elimina el contenedor al finalizar. No utiliza la base de vuestro `.env`. Requiere Docker funcionando y acceso a la imagen postgres:18-alpine.

Alternativa para un servidor PostgreSQL de pruebas ya disponible (PowerShell):

```powershell
$env:RUN_DB_TESTS='1'
$env:TEST_DB_HOST='127.0.0.1'
$env:TEST_DB_PORT='5432'
$env:TEST_DB_USER='usuario_de_pruebas'
$env:TEST_DB_PASSWORD='contraseña_de_pruebas'
npm run test:integration
```

Esa cuenta debe poder crear bases de datos. La suite crea y elimina exclusivamente su base `msusers_test_<uuid>`. Sin RUN_DB_TESTS=1, los casos de integración se muestran como omitidos. `test:e2e` apunta a esa misma suite.

## Trabajo con Git

`App/ms-users` forma parte del único repositorio del equipo: [SecureShop_Lugma-a_Morillo_Villacres](https://github.com/arieleMM-dev/SecureShop_Lugma-a_Morillo_Villacres). Es una carpeta normal, sin repositorio Git interno ni submódulo. El `.git` vacío que había dentro se respaldó fuera de SSeguro.

Los comandos Git se ejecutan desde SSeguro. Para incluir esta actividad y las reglas de exclusión:

```sh
git add .gitignore App
git diff --cached --stat
git commit -m "Agregar actividad ms-users con usuarios, roles y JWT"
git push origin main
```

Antes del commit, revisar `git diff --cached --name-only`: .env, node_modules, dist, coverage y claves privadas deben quedar excluidos. El archivo de ejemplo y package-lock.json sí se comparten. Los compañeros obtienen el código con un pull del mismo repositorio y ejecutan npm ci y npm run env:init dentro de App/ms-users. Cada uno mantiene su .env local.

El limitador usa memoria del proceso, como el taller. Para varias réplicas se necesita almacenamiento compartido de límites. La columna version registra versiones; por sí sola no impide sobrescrituras concurrentes. El pipe de cédula valida diez dígitos, conforme al taller, sin comprobar el dígito verificador nacional.

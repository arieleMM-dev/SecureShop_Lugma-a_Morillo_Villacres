# AUTH V2 - ms-users

Primer microservicio del Backend V1 del proyecto integrador. Incluye identidad N:M, CRUD, Argon2id, JWT RS256, RBAC vigente, autorización interna por HTTPS y auditoría. Forma parte del único repositorio del equipo, dentro de App/ms-users. La integración actual con STEGO se describe en la [guía del conjunto](../README.md).

## Inicio con Docker Compose

Requisitos: Node.js 24 o posterior compatible, npm, Docker Desktop iniciado y OpenSSL para generar certificados locales. En Windows puede utilizarse el OpenSSL instalado con Git; también puede indicarse su ruta mediante OPENSSL_PATH.

Desde App/ms-users:

```sh
npm ci
npm run env:init
docker compose up -d --build --wait
docker compose exec auth node dist/database/seed.js
```

Compose inicia AUTH y PostgreSQL en contenedores separados y aplica las migraciones antes de arrancar AUTH. La base utiliza un volumen persistente. `env:init` crea .env y las claves/certificados locales; conserva valores y material existente. La siembra usa SEED_PASSWORD de .env y está limitada a desarrollo. Cuenta ADMIN de ejemplo: jperez; ANALYST: amendoza; USER: mgomez; USER+ANALYST: cvega. Una siembra repetida no cambia cuentas existentes.

API de desarrollo: http://localhost:3001/api/v1. API HTTPS: https://localhost:3443/api/v1. Swagger de desarrollo: /docs. Login: POST /auth/login con identifier y password. Perfil: GET /auth/profile. Logout: POST /auth/logout. Antes de enviar solicitudes HTTPS, instalar/confiar en secrets/ca.crt en el cliente; no desactivar la verificación TLS.

```sh
docker compose stop auth
docker compose start auth
docker compose logs auth
```

Para ejecución local sin contenedor AUTH: `docker compose up -d postgres`, `npm run db:migrate`, `npm run seed` y `npm run start:dev`. DB_HOST en .env debe apuntar al host de PostgreSQL local. Dentro de Compose se sobrescribe a postgres.

## Seguridad y configuración

- .env.example se versiona sin secretos. .env y secrets/ se excluyen de Git y del contexto Docker.
- JWT_PRIVATE_KEY_PATH y JWT_PUBLIC_KEY_PATH identifican el par RSA. AUTH es el único receptor de la privada. Los JWT anteriores HS256 dejan de ser válidos al actualizar.
- AUTH_TLS_CERT_PATH y AUTH_TLS_KEY_PATH configuran HTTPS/TLS 1.3; STEGO_SERVICE_TOKEN es una credencial aleatoria exclusiva de la integración.
- A STEGO solo se distribuyen la clave pública JWT, la CA TLS y su credencial de servicio mediante configuración privada. Nunca copiarle todo el .env de AUTH ni montar claves privadas.
- Los certificados generados son de desarrollo y vencen a los 30 días. En despliegues reales usar certificados vigentes de una autoridad confiable. La rotación de claves JWT requiere distribuir la nueva pública y volver a iniciar sesión; el cambio de credencial de servicio requiere actualizar ambos extremos.
- Si ya existen tablas sin historial de migraciones, reconciliar el esquema antes de continuar. No borrar bases ni activar synchronize para forzar una actualización. Cambiar DB_PASSWORD en un .env no cambia la contraseña de un volumen previamente inicializado.
- El limitador usa memoria del proceso: varias réplicas requerirían un almacenamiento compartido. Los puertos publicados están limitados a loopback.

## Documentación y pruebas

- [Guía técnica, arquitectura, ER, matriz de permisos y contrato de STEGO](docs/AUTH_V2.md).
- [OpenAPI AUTH](docs/openapi.json).
- [Colección Postman](docs/auth-v2.postman_collection.json).
- [Resultados de integración](docs/pruebas-auth-v2.txt).
- [Verificación Compose](docs/verificacion-compose.json).

```sh
npm run build
npm test -- --runInBand
npm run lint
npm run test:docker
npm run docs:openapi
```

`test:docker` requiere haber ejecutado env:init. Crea un PostgreSQL temporal con contraseña y puerto aleatorios, ejecuta las pruebas en una base nueva y elimina ese contenedor. No usa vuestra base del .env. `test:integration` permite utilizar TEST_DB_HOST, TEST_DB_PORT, TEST_DB_USER y TEST_DB_PASSWORD con RUN_DB_TESTS=1; la cuenta debe poder crear bases. Las pruebas omiten todos sus casos si no se habilita RUN_DB_TESTS.

El código y la documentación se comparten con git desde SSeguro; no hay un repositorio Git anidado. Cada compañero ejecuta npm ci y env:init para obtener su configuración local. El checklist inicial se conserva; la copia 02 solo cambia casillas cumplidas y mantiene pendientes las tareas que requieren STEGO o la entrega conjunta.

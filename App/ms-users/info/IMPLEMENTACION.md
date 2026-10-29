# Integración de los cuatro documentos del profesor

Referencia: https://github.com/agcudco/ms-users-nestjs/tree/d5ed93d86455711ef193541dd3cedc0ed98ee317

Fecha de revisión: 29/10/2026. Los cuatro documentos y sus imágenes se conservan como material de referencia del profesor. Las tareas se implementaron en el código; las diferencias necesarias se detallan aquí.

## Comparación con la carpeta inicial

Ambos proyectos comparten las entidades User, Role y UserRole, módulos users/roles/user-roles y los componentes comunes. La copia local inicial tenía DTOs vacíos, servicios y controladores generados, sin conexión TypeORM ni autenticación implementadas. También tenía Jest y un .git interno sin commits ni remoto; ese .git se respaldó fuera de SSeguro para integrar el código en el repositorio principal. La referencia ya desarrolla los talleres y usa ESM/Vitest. Se incorporó su implementación manteniendo el runner Jest local y salida compilada NodeNext/CommonJS, con imports y rutas compatibles.

## Qué pide cada documento y dónde se implementa

| Documento | Trabajo | Implementación local |
|---|---|---|
| taller.md | DTOs, transformación, validación y paginación 1–100 | src/users/dto, src/roles/dto, src/user-roles/dto, src/common/dto |
| taller.md | CRUD de usuarios y roles; asignación, consulta y retirada de roles | controllers, services y modules de users, roles y user-roles |
| taller.md | Contraseñas Argon2id, ocultación de hashes, validación UUID/cédula, bajas lógicas y restricciones | users.service.ts, entidades, CedulaPipe, ParseUUIDPipe y serializador global |
| taller.md | PostgreSQL y migraciones, configuración validada, rate limiting, CORS, cabeceras, errores y request ID | app.module.ts, setup-app.ts, src/database, docker-compose.yml, env.schema.ts y common |
| taller-jwt.md | Login por username/email, JWT HS256, emisor, audiencia, vencimiento y hash ficticio | src/auth/auth.service.ts, auth.module.ts y strategies |
| taller-jwt.md | Guards globales JWT/RBAC y decoradores Public, Roles y CurrentUser | src/auth/guards, decorators y app.module.ts |
| taller-jwt.md | Roles activos desde PostgreSQL en cada petición; logout con token_version | UsersService.findActiveWithRoles, JwtStrategy y AuthService.logout |
| endpoints.md | Los 18 endpoints finales, con sus roles y códigos de respuesta | controllers de app, auth, users, roles y user-roles |
| guia-endpoints.md | Probar CRUD, login/me/logout, 401, 403, permisos ADMIN/OPERADOR/CLIENTE y revocación | test/integration.cjs; ejecución reproducible con npm run test:docker |

## Adaptaciones necesarias

- Se usa `validate: config => envSchema.parse(config)` en ConfigModule. `validationSchema` exige el contrato de Joi y no permite utilizar directamente ese objeto Zod.
- Se deja `synchronize: false` y una migración inicial explícita. La referencia activa synchronize pese al comentario que exige desactivarlo; taller.md pide migraciones. No se adaptan ni sobrescriben bases existentes automáticamente.
- Se incorporan teléfono y token_version en User, y estado, version y fecha_actualizacion en UserRole, porque los servicios y el taller JWT los necesitan.
- Los roles se normalizan a mayúsculas en DTO/servicio y se exige la representación canónica mediante CHECK + UNIQUE en PostgreSQL. Username/email también tienen una política canónica coherente con el login.
- La asignación usuario/rol usa INSERT. `save` con clave compuesta puede reutilizar una fila; el INSERT permite devolver el 409 que espera el taller al repetirla.
- Los DTOs PATCH rechazan null en campos no anulables; fechaNacimiento exige una fecha YYYY-MM-DD válida.
- La estrategia JWT valida tipo de token, UUID del sujeto, tokenVersion y presencia de expiración antes de consultar PostgreSQL.
- Se mantiene Jest, se corrigen los imports de las pruebas y la salida dist/main.js, y se reemplazan las pruebas obsoletas de Hello World por verificaciones del servicio real.
- Swagger incluye autenticación Bearer y el plugin de DTOs. La configuración HTTP está en setup-app.ts y se utiliza tanto al arrancar como en las pruebas.
- La siembra utiliza SEED_PASSWORD local, se ejecuta en transacción y no modifica cuentas ya existentes ni se permite en producción. No se reutiliza la contraseña fija del material.
- Los errores SQL no se registran automáticamente con parámetros, para evitar imprimir hashes y datos personales en los logs de TypeORM.

Las instrucciones públicas de CRUD de taller.md corresponden a una etapa anterior al taller JWT. En la versión final se debe hacer login y enviar un token ADMIN para escribir; endpoints.md contiene la política final. Las contraseñas y UUIDs de guia-endpoints.md son ejemplos: usar los valores reales de la respuesta y SEED_PASSWORD para las cuentas de demostración.

## Comprobaciones

Se ejecutaron compilación y lint, siete pruebas unitarias y 22 casos de integración sobre PostgreSQL 18 temporal. Los casos cubren los 18 endpoints, normalización, duplicados, restricciones SQL, asignación masiva, hashes Argon2id no expuestos, roles y usuarios desactivados, tokens inválidos/expirados, logout, límite de login, reversión de migraciones y siembra repetible. Estos resultados se refieren a la copia integrada; no se ejecutaron migraciones ni siembra sobre una base existente del equipo.

## Organización y entrega

La copia de comparación está fuera de SSeguro, en el espacio temporal de esta sesión. El código resultante se aplica en App/ms-users. No se mezcla el historial del profesor ni se publica nada en su repositorio. App/ms-users es una carpeta normal del repositorio principal SecureShop_Lugma-a_Morillo_Villacres, sin Git interno ni submódulo. Se conserva el .git principal de SSeguro y el .env local existente; env:init añade solamente variables necesarias ausentes o marcadas CHANGE_ME. El respaldo del código anterior está fuera de SSeguro: ms-users-antes-20261029.zip en el espacio de trabajo temporal de la sesión.

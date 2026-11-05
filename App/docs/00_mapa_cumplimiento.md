# Mapa de cumplimiento de la consigna

Referencia de evaluación. [Proyecto Integrador del Primer Parcial, páginas 2–4 y anexos A–E](../../docs/Teoria/Proyecto_Integrador_Primer_Parcial.pdf).

## 2.1 Arquitectura e independencia

| Qué se exige | Dónde se implementa y cómo se evidencia |
|---|---|
| Dos aplicaciones con procesos, configuraciones, endpoints y documentación propios | AUTH arranca desde [main.ts](../ms-users/src/main.ts) y [server.ts](../ms-users/src/server.ts). STEGO tiene su aplicación en [main.py](../ms-stego/app/main.py) y configuración en [settings.py](../ms-stego/app/settings.py). Cada servicio tiene su propio [README AUTH](../ms-users/README.md) o [README STEGO](../ms-stego/README.md), contrato y Dockerfile. |
| Contenedores separados, arranque y parada autónomos | [Docker Compose](../docker-compose.yml) declara `auth`, `stego` y PostgreSQL como infraestructura. T01 y T08 demuestran que la API del servicio que sigue activo responde cuando se detiene el otro. [Pruebas](04_pruebas_y_evidencias.md). |
| Justificar tecnologías y separar datos | NestJS/TypeScript con PostgreSQL en AUTH. FastAPI/Python con Pillow, NumPy, SciPy y SQLite en STEGO. El diagrama muestra límites de confianza, redes, procesos y almacenamiento. [Arquitectura](01_arquitectura_y_modelo_datos.md). |

## 2.2 AUTH

| Qué se exige | Implementación y evidencia |
|---|---|
| AUTH como autoridad de identidades y roles; CRUD | [Usuarios](../ms-users/src/users/users.controller.ts), [roles](../ms-users/src/roles/roles.controller.ts) y [asignaciones](../ms-users/src/user-roles/user-roles.controller.ts). Las operaciones de administración exigen ADMIN. |
| `users`, `roles`, `user_roles`, PK, FK, unicidad y auditoría | [User](../ms-users/src/users/entities/user.entity.ts), [Role](../ms-users/src/roles/entities/role.entity.ts), [UserRole](../ms-users/src/user-roles/entities/user-role.entity.ts) y [migración AUTH V2](../ms-users/src/database/migrations/1793664000000-AuthV2.ts). El par `(user_id, role_id)` es único y las asignaciones son filas de PostgreSQL. T05–T06 verifican N:M y rechazo de duplicados. |
| Credenciales y JWT | [AuthService](../ms-users/src/auth/auth.service.ts) valida credenciales persistidas. [UsersService](../ms-users/src/users/users.service.ts) protege contraseñas con Argon2id. [AuthModule](../ms-users/src/auth/auth.module.ts) y [JwtStrategy](../ms-users/src/auth/strategies/jwt.strategy/jwt.strategy.ts) aplican RS256, emisor, audiencia, vigencia, `sub` y versión de sesión. [Gestión de claves y flujo](02_seguridad_contratos_y_metodo.md). |
| RBAC actual y mínimo privilegio | [JwtStrategy](../ms-users/src/auth/strategies/jwt.strategy/jwt.strategy.ts) y [UsersService](../ms-users/src/users/users.service.ts) consultan usuario, roles y asignaciones activos. [RolesGuard](../ms-users/src/auth/guards/roles/roles.guard.ts) aplica la política por ruta. ADMIN administra, ANALYST analiza y lee lo propio, USER usa su perfil y sesión. La política por acción está declarada en código; las asignaciones a personas y su vigencia se resuelven en PostgreSQL. T04, T07 y T11 muestran denegación, revocación y propiedad. |

## 2.3 STEGO

| Qué se exige | Implementación y evidencia |
|---|---|
| Multipart y validación de archivo | [API y middleware](../ms-stego/app/main.py) exigen un campo `file`, extensión PNG, MIME, firma y tamaño. [Trabajador](../ms-stego/app/worker.py) comprueba IHDR, dimensiones y decodificación; [procesamiento](../ms-stego/app/processing.py) aplica el plazo y el entorno del proceso. T10 evidencia 400, 413 y 415. |
| Técnica real con parámetros y muestras | [Detector](../ms-stego/app/detector.py) aplica el contraste chi-cuadrado por pares LSB a PNG de 8 bits compatibles. [Método, parámetros y límites](02_seguridad_contratos_y_metodo.md#método-de-análisis-esteganográfico), [muestras](pruebas/muestras/manifest.json), [resultados reales](pruebas/resultados/stego-analisis-muestras.json) y T09. |
| Clasificación, persistencia y política | `sin_indicios`, `sospechoso`, `no_concluyente` y `error`. [Store](../ms-stego/app/store.py) guarda ID, propietario, SHA-256, técnica, indicadores, fecha, resultado y política. La [API](../ms-stego/app/main.py) devuelve advertencia o cuarentena y rechaza entradas incompatibles. El volumen es privado y aplica retención; no hay ruta pública para descargar archivos. |
| Tratamiento aislado | [Trabajador](../ms-stego/app/worker.py), [Dockerfile STEGO](../ms-stego/Dockerfile) y [Compose](../docker-compose.yml). Procesamiento sin root y con límites de red, CPU, memoria y tiempo. La suite integrada comprueba que el trabajador no puede abrir un socket. |

## 2.4 Comunicación segura y RBAC

| Qué se exige | Implementación y evidencia |
|---|---|
| Cliente con JWT y validación local | AUTH entrega el JWT. STEGO verifica firma y claims con la clave pública y recibe el token mediante `Authorization: Bearer`. [Security](../ms-stego/app/security.py), T02–T03. |
| Decisión vigente, acción y recurso | [Middleware STEGO](../ms-stego/app/main.py) solicita decisión antes de consumir el archivo. Para consultar un resultado, obtiene su propietario de SQLite. [Endpoint interno AUTH](../ms-users/src/internal-authorization/internal-authorization.module.ts) vuelve a validar sesión y roles persistidos. T07 y T11. |
| Identidad de servicio, canal seguro y denegación por defecto | `ServiceAuthGuard` exige TLS y `X-Service-Token`; STEGO valida el certificado de AUTH. [Security](../ms-stego/app/security.py) comprueba sujeto, acción, recurso y estructura de la respuesta. La caída devuelve 503 y la respuesta no verificable devuelve 502. [Pruebas de seguridad](../ms-stego/tests/test_security.py) y T08. |
| Separación y rechazo de permisos manipulados | [Compose](../docker-compose.yml) conecta solo AUTH a `auth-data` y monta material público en STEGO. STEGO carece de contraseñas de identidad y clave privada JWT. T04 prueba que las cabeceras de rol falsificadas no conceden acceso. [Matriz de controles](03_matriz_riesgos.md). |

## 2.5 Contrato mínimo

| Método | Ruta del proyecto | Acceso | Código |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Público, con límite | [AuthController](../ms-users/src/auth/auth.controller.ts) |
| GET | `/api/v1/auth/profile` | Autenticado | [AuthController](../ms-users/src/auth/auth.controller.ts) |
| POST | `/api/v1/auth/logout` | Sesión autenticada | [AuthController](../ms-users/src/auth/auth.controller.ts) |
| POST y GET | `/api/v1/users` | ADMIN | [UsersController](../ms-users/src/users/users.controller.ts) |
| PATCH | `/api/v1/users/{id}` | ADMIN | [UsersController](../ms-users/src/users/users.controller.ts) |
| POST y GET | `/api/v1/roles` | ADMIN | [RolesController](../ms-users/src/roles/roles.controller.ts) |
| PATCH | `/api/v1/roles/{id}` | ADMIN | [RolesController](../ms-users/src/roles/roles.controller.ts) |
| POST | `/api/v1/user-roles` | ADMIN | [UserRolesController](../ms-users/src/user-roles/user-roles.controller.ts) |
| DELETE | `/api/v1/user-roles/{id}` | ADMIN | [UserRolesController](../ms-users/src/user-roles/user-roles.controller.ts) |
| POST | `/internal/authorization/check` | Cliente STEGO autenticado sobre TLS | [InternalAuthorizationController](../ms-users/src/internal-authorization/internal-authorization.module.ts) |
| POST | `/api/v1/steganography/analyze` | ADMIN o ANALYST | [API STEGO](../ms-stego/app/main.py) |
| GET | `/api/v1/steganography/results/{analysis_id}` | ANALYST propietario o ADMIN | [API STEGO](../ms-stego/app/main.py) |

La colección conserva las operaciones de administración de AUTH y agrupa STEGO en **Analizar imagen** y **Consultar resultado**. La autorización interna permanece en OpenAPI y la invoca STEGO. La salud de STEGO se verifica aparte en `GET /health`. Los códigos 401/403/413/415 se verifican en T03, T04, T10 y T11. [Auditoría AUTH](../ms-users/src/audit/audit.module.ts) y [auditoría STEGO](../ms-stego/app/store.py) registran datos acotados. [OpenAPI AUTH](contratos/openapi-auth.json), [OpenAPI STEGO](contratos/openapi-stego.json), [colección Postman](pruebas/backend-v1.postman_collection.json) y [resultados](04_pruebas_y_evidencias.md).

## 3 Entregables y presentación

| Bloque | Entregable y ubicación |
|---|---|
| 1. Código fuente separado y construcción | [AUTH](../ms-users/README.md), [STEGO](../ms-stego/README.md), [dependencias AUTH](../ms-users/package-lock.json), [dependencias STEGO](../ms-stego/requirements.txt), [Dockerfile AUTH](../ms-users/Dockerfile) y [Dockerfile STEGO](../ms-stego/Dockerfile). |
| 2. Preparación y persistencia | [README conjunto](../README.md), [.env.example AUTH](../ms-users/.env.example), [.env.example STEGO](../ms-stego/.env.example), [migración inicial](../ms-users/src/database/migrations/1793232000000-InitialSchema.ts), [migración AUTH V2](../ms-users/src/database/migrations/1793664000000-AuthV2.ts), [siembra de desarrollo](../ms-users/src/database/seed.ts) y [Compose](../docker-compose.yml). Los volúmenes separan las identidades de los resultados. |
| 3. Diagramas | [Arquitectura y modelo entidad–relación](01_arquitectura_y_modelo_datos.md), con las dos imágenes SVG. |
| 4. JWT, RBAC, permisos, OpenAPI y detección | [Seguridad, contratos y método](02_seguridad_contratos_y_metodo.md) reúne la explicación y enlaza los contratos completos. |
| 5. Evidencia de desarrollo seguro | [Matriz de riesgos](03_matriz_riesgos.md), que vincula cada riesgo con controles, pruebas y principios solicitados. |
| 6. Pruebas, solicitudes, muestras y auditoría | [Pruebas y evidencias](04_pruebas_y_evidencias.md), [colección REST](pruebas/backend-v1.postman_collection.json), [muestras](pruebas/muestras/manifest.json), [auditoría AUTH](pruebas/resultados/auth-auditoria-ejemplo.json) y [auditoría STEGO](pruebas/resultados/stego-auditoria.json). La consigna requiere los tipos de prueba y los escenarios del anexo D. La implementación usa Jest, Node.js, pytest y HTTPX. |
| 7. Sustentación | [Guion detallado para Postman](05_guion_sustentacion_postman.md). Las pruebas automatizadas respaldan lo que el equipo debe demostrar en la sesión. |


## Cobertura del documento completo

| Parte de la consigna | Evidencia que permite defenderla |
|---|---|
| Resumen y §§1–1.2, objetivo y responsabilidades | [Arquitectura](01_arquitectura_y_modelo_datos.md), servicios separados, identidades N:M y análisis real. |
| §1.3, alcance | La entrega es backend. Salas, interfaz, mensajería y E2EE pertenecen a fases posteriores. Los documentos de actividades anteriores se identifican por su propio alcance. |
| §§2.1–2.5 | Matrices de este mapa, contratos OpenAPI y rutas del código enlazadas arriba. |
| §3, código y configuración | README, Dockerfiles, dependencias, `.env.example`, migraciones, seed y Compose enlazados arriba. |
| §3, documentos y evidencias | Diagramas SVG, explicación JWT/RBAC, matriz de permisos, método, matriz de riesgos, colección REST, muestras y registros. [Índice de entregables](README.md). |
| §3, sustentación | [Guion](05_guion_sustentacion_postman.md). La ejecución por el equipo durante la presentación se registra por separado en los checklists. |
| §4, rúbrica de 20 puntos | Arquitectura (3), identidad (3), JWT (3), RBAC/integración (4), detección (5) y pruebas/documentación (2). Cada grupo está enlazado con su implementación y T01–T12. La calificación corresponde al docente. |
| Anexo A | PK, FK, UUID propio y par único en entidades y migraciones de AUTH. |
| Anexo B | Endpoint interno sobre TLS, identidad de servicio, decisión actual por acción/recurso y denegación por defecto. |
| Anexo C | Contrato de resultados con SHA-256, indicadores calculados, fecha, clasificación, política y limitaciones. |
| Anexo D | [Pruebas T01–T12](04_pruebas_y_evidencias.md), código ejecutable y resultados reproducibles. |
| Anexo E | [Matriz M01–M07](03_matriz_riesgos.md), que contiene los seis grupos de activos del ejemplo y el riesgo del detector. |
| §6, referencias | Los checklists conservan la bibliografía del PDF. La documentación técnica vincula el método, los principios ISO, JWT, Zero Trust y carga segura con sus fuentes. |

El [checklist 04](historico/04_Analisis_y_checklist_Primer_Parcial.md) conserva el texto del 03 y marca la comprobación previa P09. Las casillas P01–P08 se completan cuando el equipo realice la presentación.

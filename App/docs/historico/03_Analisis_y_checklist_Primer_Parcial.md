# 01. Análisis inicial y checklist del Proyecto Integrador - Primer Parcial

**Asignatura:** Desarrollo Software Seguro, Departamento de Ciencias de la Computación, ESPE.  
**Fuente única de requisitos:** [Proyecto_Integrador_Primer_Parcial.pdf](../../../docs/Teoria/Proyecto_Integrador_Primer_Parcial.pdf), sus ocho páginas, secciones 1-6 y anexos A-E.  
**Fecha de este análisis:** 02/11/2026.  
**Entrega:** miércoles **04/11/2026, a la hora de clases**, con repositorio, documentación, evidencias y demostración durante la sesión. El PDF no establece una hora numérica.  
**Calificación máxima:** 20 puntos.

Este archivo inventaría los requisitos y evidencias de la entrega. Las casillas quedan pendientes porque este primer análisis no es una auditoría del código existente: una casilla solo debe marcarse cuando se identifique la implementación o evidencia correspondiente y se compruebe su cumplimiento. Las referencias de página permiten contrastar el checklist con el enunciado.

## 1. Primer análisis breve

Debemos diseñar, implementar, integrar y evaluar el **Backend V1 de una aplicación de chat seguro**, compuesto por **dos microservicios REST independientes**. AUTH administra identidades, roles, asignaciones N:M y JWT; STEGO valida y analiza imágenes, con procesamiento real, después de comprobar la identidad y los permisos vigentes. AUTH es la única autoridad de identidades; STEGO mantiene sus resultados y archivos sin acceder a las tablas de AUTH.

El punto decisivo de la integración es que **validar un JWT no basta para autorizar**: STEGO debe verificar el token y consultar a AUTH en cada operación protegida. Si se revoca un permiso o AUTH no proporciona una decisión verificable, la operación debe denegarse sin analizar el archivo. La entrega debe demostrar estos comportamientos mediante código ejecutable, pruebas reproducibles y documentación.

Podemos mantener **un único repositorio** con ambas aplicaciones. La independencia exigida se refiere a procesos, configuración, APIs, documentación y despliegue: cada servicio debe iniciarse y detenerse por separado y tener su propio contenedor en Docker Compose. Una base de datos o un volumen son infraestructura de apoyo, no un tercer microservicio.

**Fuera de esta entrega:** interfaz web o móvil; creación y administración de salas; mensajería en tiempo real; cifrado de extremo a extremo del chat; restricción de dispositivos de participantes. El proyecto general contempla esas funciones para etapas posteriores. No deben sustituir el trabajo requerido para AUTH y STEGO. *(Fuente: resumen, §§1-1.3 y 2.1, pp. 1-2.)*

## 2. Rúbrica y evidencia necesaria

| Criterio | Máximo | Qué debemos demostrar para cubrirlo | Checklist relacionado |
|---|---:|---|---|
| 1. Arquitectura | 3,0 | Separación real AUTH/STEGO, despliegue independiente, contratos REST y Docker Compose. | A, API, D, T01 |
| 2. Modelo de identidad | 3,0 | CRUD de usuarios y roles; relación N:M persistida; claves foráneas y unicidad. | I, API, T05-T06 |
| 3. Autenticación JWT | 3,0 | Credenciales verificadas, hashing, firma, expiración y verificación de tokens. | J, T02-T03 |
| 4. RBAC e integración | 4,0 | Autorización vigente desde AUTH, permisos por rol, 401/403, revocación y fallo seguro. | R, C, API, T04, T07-T08, T11 |
| 5. Detección de esteganografía | 5,0 | Validación y procesamiento real de imágenes, técnica justificada, resultados, alertas o política y auditoría. | S, T09-T10, T12 |
| 6. Pruebas y documentación | 2,0 | OpenAPI, evidencias reproducibles, muestras, matriz de riesgos, guía de ejecución y sustentación. | D, E, T01-T12, P |
| **Total** | **20,0** | Se revisan ejecución, código, documentación y resultados de pruebas. | Todos |

**Escala de logro:** excelente = 100 %; satisfactorio = 75 %; en desarrollo = 50 %; insuficiente = 25 %; no demostrado = 0 %. **Puntaje por criterio = máximo del criterio × porcentaje de logro**. Por ejemplo, RBAC e integración satisfactorio obtiene 4 × 0,75 = 3 puntos. La suma no puede superar 20. *(Fuente: §4, p. 5.)*

## 3. Checklist de implementación

### A. Arquitectura e independencia

*Fuente: resumen, §§1.1-1.2, 2.1, figura 1 y §3, pp. 1-2 y 4.*

- [x] **A01.** Organizar AUTH y STEGO como dos aplicaciones backend REST ejecutables, con responsabilidades separadas.
- [x] **A02.** Dar a cada aplicación su propio proceso, configuración, endpoints y documentación; demostrar que puede iniciarse, detenerse y desplegarse de manera autónoma.
- [x] **A03.** Definir AUTH y STEGO en **contenedores separados** en un `docker-compose.yml` que permita reproducir su ejecución conjunta.
- [x] **A04.** Justificar el lenguaje y las tecnologías de cada servicio, sean iguales o diferentes.
- [x] **A05.** Mantener en AUTH la persistencia exclusiva de identidades y en STEGO los resultados y archivos necesarios; limitar privilegios y acoplamiento, sin compartir indebidamente tablas o credenciales de AUTH.
- [x] **A06.** Preparar la persistencia de base de datos y almacenamiento necesaria sin comprometer credenciales. Identificarla como infraestructura de apoyo.

### I. AUTH: entidades, integridad y administración

*Fuente: §2.2 y anexo A/§5.1, pp. 2-3 y 5.*

- [x] **I01.** Implementar `users` con `id` (PK), `username` único, `email` único, `password_hash`, `status`, `created_at` y `updated_at`.
- [x] **I02.** Implementar `roles` con `id` (PK), `name` único, `description`, `status` y campos de auditoría.
- [x] **I03.** Implementar `user_roles` con **`id` propio como PK**, `user_id` (FK), `role_id` (FK), `assigned_at` y **`UNIQUE(user_id, role_id)`**.
- [x] **I04.** Aplicar las claves foráneas de `user_roles` hacia `users` y `roles` en una base de datos relacional, mediante una tabla asociativa real.
- [x] **I05.** Permitir varios roles por usuario y varios usuarios por rol; impedir asociaciones duplicadas.
- [x] **I06.** Implementar CRUD de usuarios y roles, y la asignación y retirada de roles, conforme al contrato de APIs. La rúbrica pide CRUD; la tabla mínima no enumera todas las posibles rutas de consulta individual o eliminación de usuarios/roles, por lo que deben documentarse también las operaciones necesarias para completar ese CRUD.
- [x] **I07.** Resolver identidades y asignaciones desde datos persistidos. No reemplazar la relación N:M por arreglos exclusivamente en memoria ni por asignaciones de usuarios/permisos codificadas como constantes.

### J. AUTH: credenciales y JWT

*Fuente: §§2.2, 2.4-2.5, anexo B y bibliografía [5, 7], pp. 2-4, 6 y 8.*

- [x] **J01.** Validar las credenciales de login contra usuarios persistidos y almacenar las contraseñas con **Argon2id o bcrypt**.
- [x] **J02.** Emitir JWT firmados, con expiración acotada y un identificador de usuario en `sub`.
- [x] **J03.** Definir y documentar el algoritmo autorizado, la gestión y protección de claves y los controles de firma, emisor, audiencia y vigencia.
- [x] **J04.** Verificar efectivamente esos controles en las solicitudes protegidas; rechazar tokens ausentes, manipulados, inválidos o vencidos.
- [x] **J05.** Implementar y documentar login público con limitaciones, consulta del perfil autenticado y logout de una sesión autenticada.
- [x] **J06.** Revisar la recomendación de **firma asimétrica**: el PDF la recomienda, sin imponer un algoritmo concreto. El diseño debe mantener la clave privada de firma únicamente en AUTH y permitir la verificación criptográfica en STEGO sin entregarle esa clave privada; documentar la solución elegida.

### R. RBAC vigente y mínimo privilegio

*Fuente: §§2.2, 2.4-2.5 y anexo B, pp. 3-4 y 6.*

- [x] **R01.** Definir los roles requeridos **`ADMIN`, `ANALYST` y `USER`** y su matriz de permisos.
- [x] **R02.** Reservar las operaciones administrativas para `ADMIN`.
- [x] **R03.** Permitir a `ANALYST` ejecutar análisis y consultar sus resultados autorizados.
- [x] **R04.** Limitar `USER` a su perfil y a las operaciones expresamente habilitadas; denegar su intento de analizar imágenes con 403.
- [x] **R05.** Permitir acumulación de roles manteniendo el mínimo privilegio en cada operación.
- [x] **R06.** Consultar usuarios, roles y asignaciones vigentes para decidir permisos. No confiar exclusivamente en roles de un JWT antiguo ni en listas codificadas de usuarios o permisos.
- [x] **R07.** Hacer efectiva la eliminación o desactivación de una asignación en la siguiente solicitud que necesite ese permiso, incluso con el mismo JWT aún vigente.
- [x] **R08.** Autorizar el acceso a resultados por rol **y por propiedad del recurso**. Documentar quién puede consultar cada análisis y denegar la consulta ajena sin autorización.

### S. STEGO: recepción, análisis, resultados y archivos

*Fuente: §2.3, anexo C/§5.3, T09-T10 y anexo E, pp. 3 y 6-7.*

- [x] **S01.** Exponer una API REST independiente que reciba imágenes mediante `multipart/form-data`.
- [x] **S02.** Comprobar identidad y autorización vigente antes de ejecutar el análisis del archivo.
- [x] **S03.** Validar **extensión, firma real del archivo, tipo de contenido, tamaño y límites de procesamiento**. Rechazar archivos inválidos, corruptos o excesivos sin procesamiento indebido.
- [x] **S04.** Soportar como mínimo **PNG o BMP** compatibles con la técnica seleccionada. El texto permite elegir entre estos formatos; no obliga a implementar ambos.
- [x] **S05.** Implementar **al menos una técnica verificable**, con procesamiento real y cálculos propios de esa técnica; justificar procedimiento y parámetros. El análisis estadístico LSB es el ejemplo del enunciado.
- [x] **S06.** Preparar una imagen original/de referencia sin modificaciones conocidas y una muestra con información oculta compatible con el detector. T09 solicita expresamente una muestra con carga **LSB**; debe incluirse para cubrir esa prueba.
- [x] **S07.** Distinguir las categorías **sin_indicios, sospechosos, no_concluyentes o con error**, según la evidencia; definir los nombres exactos de estado en el contrato y documentar cuándo se produce cada resultado.
- [x] **S08.** Conservar por análisis, como mínimo: identificador, usuario solicitante, hash **SHA-256** del archivo, técnica ejecutada, indicadores calculados, fecha, resultado y política aplicada.
- [x] **S09.** Definir y aplicar la política correspondiente: **rechazo, cuarentena o advertencia**, documentando su relación con los resultados. El PDF admite alternativas; hay que concretar la política implementada.
- [x] **S10.** Tratar los archivos sin ejecutar código recibido, evitar su exposición pública, controlar su eliminación o aislamiento y justificar los controles de procesamiento aislado del anexo E.
- [x] **S11.** Entregar resultados y métricas realmente calculados y explicar limitaciones: un archivo sospechoso es un **indicio**, no una prueba definitiva de esteganografía.
- [x] **S12.** Concretar en OpenAPI el contrato de resultados. El anexo C ilustra `analysis_id`, `user_id`, `filename`, `sha256`, `technique`, `status`, `indicators`, `action` y `limitations`; la fecha es obligatoria por §2.3 aunque no figure en ese JSON ilustrativo.

### C. Comunicación segura AUTH-STEGO

*Fuente: §2.4 y anexo B/§5.2, pp. 3 y 6.*

- [x] **C01.** Hacer que el cliente obtenga el JWT en AUTH y lo envíe a STEGO en `Authorization: Bearer <token>`.
- [x] **C02.** Verificar criptográficamente el JWT en STEGO antes de aceptar la operación protegida.
- [x] **C03.** Consultar a AUTH mediante un endpoint interno protegido para obtener una decisión **actual** sobre la acción y, cuando corresponda, el recurso.
- [x] **C04.** Hacer que AUTH valide nuevamente la identidad del usuario y sus asignaciones activas antes de devolver permitir/denegar.
- [x] **C05.** Autenticar a STEGO como servicio ante AUTH y proteger el canal de comunicación. El PDF exige ambos controles, sin imponer un mecanismo concreto.
- [x] **C06.** Denegar por defecto si AUTH está inaccesible, falla la comunicación/autenticación de servicio o no existe una decisión verificable. STEGO no debe procesar el archivo en esos casos.
- [x] **C07.** Obtener una decisión válida para cada operación protegida; no tratar una respuesta previa de autorización como permiso permanente.
- [x] **C08.** Impedir que STEGO consulte directamente la base de AUTH, almacene contraseñas o reciba la clave privada de firma.
- [x] **C09.** Rechazar permisos suministrados por el cliente en cabeceras o campos manipulables; comprobarlos desde AUTH.
- [x] **C10.** Concretar en OpenAPI el contrato interno ilustrado en el anexo B: solicitud con `subject_token`, `action` y `resource_id`; respuesta con `subject_id`, `action`, `allowed` y `reason`. Documentar cómo se autentica el servicio y cómo se protege el canal. El ejemplo usa la acción `steganography.analyze` y recurso nulo cuando no corresponde un recurso existente.

### API. Contrato mínimo completo

*Fuente: §2.5, pp. 3-4. Se desdoblan POST/GET en operaciones separadas. Se aceptan prefijos de versión, como `/api/v1`, si se documentan y conservan responsabilidades y controles.*

| Pendiente | ID | Servicio | Método | Ruta del PDF | Acceso requerido |
|---|---|---|---|---|---|
| [x] | API01 | AUTH | POST | `/api/auth/login` | Público, con limitaciones. |
| [x] | API02 | AUTH | GET | `/api/auth/profile` | Usuario autenticado. |
| [x] | API03 | AUTH | POST | `/api/auth/logout` | Sesión autenticada. |
| [x] | API04 | AUTH | POST | `/api/users` | ADMIN. |
| [x] | API05 | AUTH | GET | `/api/users` | ADMIN. |
| [x] | API06 | AUTH | PATCH | `/api/users/:id` | ADMIN. |
| [x] | API07 | AUTH | POST | `/api/roles` | ADMIN. |
| [x] | API08 | AUTH | GET | `/api/roles` | ADMIN. |
| [x] | API09 | AUTH | PATCH | `/api/roles/:id` | ADMIN. |
| [x] | API10 | AUTH | POST | `/api/user-roles` | ADMIN. |
| [x] | API11 | AUTH | DELETE | `/api/user-roles/:id` | ADMIN. |
| [x] | API12 | AUTH | POST | `/internal/authorization/check` | Solo STEGO autenticado como servicio. |
| [x] | API13 | STEGO | POST | `/api/steganography/analyze` | ADMIN o ANALYST. |
| [x] | API14 | STEGO | GET | `/api/steganography/results/:id` | RBAC y propiedad del recurso. |

- [x] **API15.** Devolver respuestas coherentes y códigos HTTP apropiados: **401** por autenticación ausente/inválida; **403** por falta de permiso; **413** por carga excesiva; **415** por formato no admitido.
- [x] **API16.** Registrar eventos relevantes sin divulgar contraseñas, claves ni JWT completos.
- [x] **API17.** Documentar **todos** los endpoints con OpenAPI y permitir verificarlos con Postman, Insomnia o herramienta equivalente.

## 4. Checklist de entregables

*Fuente: §3 y bloque de recepción/fecha, pp. 4-5.*

### D. Código, configuración y documentación técnica

- [x] **D01.** Entregar **un repositorio de código fuente** con ambas aplicaciones separadas, dependencias, configuraciones de ejemplo y archivos de construcción.
- [x] **D02.** Incluir `README.md` con instrucciones para **clonar, configurar e iniciar** los servicios de forma reproducible, además de la documentación independiente de cada aplicación exigida por §2.1.
- [x] **D03.** Incluir **un `.env.example` por aplicación**, sin secretos reales.
- [x] **D04.** Incluir migraciones o scripts para preparar la base de datos de AUTH y el `docker-compose.yml` con ambos microservicios.
- [x] **D05.** Entregar un **diagrama de arquitectura** que identifique límites de confianza, responsabilidades, comunicación AUTH-STEGO y persistencias separadas, en coherencia con la figura 1.
- [x] **D06.** Entregar un **diagrama entidad-relación** con la asociación N:M entre `users`, `roles` y `user_roles`, sus PK, FK y unicidad.
- [x] **D07.** Explicar autenticación JWT, autorización RBAC y estrategia para comprobar roles vigentes, incluyendo algoritmo, claves y controles de tokens.
- [x] **D08.** Entregar una **matriz de roles y permisos**, incluida la política de acceso a resultados por recurso.
- [x] **D09.** Entregar las **especificaciones OpenAPI de ambos servicios**, incluido el contrato interno de autorización.
- [x] **D10.** Entregar la justificación técnica del método esteganográfico, sus cálculos, parámetros, formatos compatibles y limitaciones.

### E. Seguridad y evidencias reproducibles

- [x] **E01.** Entregar una **matriz de activos, amenazas, vulnerabilidades, riesgos y controles** adaptada a la arquitectura y a los riesgos reales identificados.
- [x] **E02.** Vincular sus controles con **Zero Trust**, **Secure by Design** y **Shift Left Security**: verificación explícita de identidad/permisos, controles incorporados desde el diseño y pruebas tempranas de credenciales, autorización y archivos.
- [x] **E03.** Relacionar el diseño y los controles con los principios pertinentes de **ISO/IEC 27001** e **ISO/IEC 27034**, sin afirmar certificación ni cumplimiento normativo integral.
- [x] **E04.** Adjuntar resultados reproducibles de pruebas **unitarias, funcionales, de seguridad y de integración**, vinculadas con los riesgos identificados y que incluyan T01-T12.
- [x] **E05.** Entregar una **colección de solicitudes REST** utilizable con Postman, Insomnia o equivalente, que permita repetir las pruebas.
- [x] **E06.** Entregar las **muestras de imágenes** de referencia y con información oculta compatible con el detector, incluida la muestra LSB de T09.
- [x] **E07.** Adjuntar **registros de auditoría depurados** de información sensible, con trazabilidad de accesos y análisis.
- [x] **E08.** Entregar resultados obtenidos mediante ejecución comprobable. Las capturas pueden acompañar la evidencia, pero **no reemplazan** la ejecución demostrable de las pruebas.

**Cobertura del anexo E (p. 7):** usar estas seis filas de referencia para construir y justificar la matriz completa E01; añadir las vulnerabilidades y riesgos concretos de nuestra implementación.

| Pendiente | Activo de referencia | Amenaza de referencia | Control esperado por el PDF |
|---|---|---|---|
| [x] | Credenciales e identidades | Suplantación y divulgación. | Hash seguro, validaciones y límites de login. |
| [x] | Asignaciones N:M | Elevación de privilegios. | Integridad referencial, autorización vigente y revocación. |
| [x] | JWT y claves | Falsificación o fuga. | Firma, caducidad, verificación de claims y secreto protegido. |
| [x] | Comunicación AUTH-STEGO | Suplantación de servicio. | Identidad de servicio, canal seguro y denegación por defecto. |
| [x] | Archivos e imágenes | Carga maliciosa o análisis evasivo. | Validación de archivos, límites y procesamiento aislado. |
| [x] | Resultados y registros | Acceso indebido. | RBAC por recurso y auditoría sin datos sensibles. |

## 5. Los doce escenarios mínimos de prueba

*Fuente: anexo D/§5.4, pp. 6-7. Todos son obligatorios; las pruebas adicionales no los sustituyen.*

| Pendiente | ID | Escenario exigido | Resultado mínimo esperado |
|---|---|---|---|
| [x] | T01 | Iniciar y detener AUTH y STEGO por separado. | Procesos y APIs autónomos; integración reproducible. |
| [x] | T02 | Autenticar con contraseña válida e inválida. | JWT firmado o rechazo de autenticación, respectivamente. |
| [x] | T03 | Consultar STEGO sin JWT, con JWT manipulado o vencido. | HTTP 401 en los tres casos. |
| [x] | T04 | Un usuario con rol USER intenta analizar una imagen. | HTTP 403. |
| [x] | T05 | Asignar dos roles a un usuario y un mismo rol a dos usuarios. | Relación N:M persistida e íntegra en ambos casos. |
| [x] | T06 | Repetir una asignación usuario-rol. | No se genera una asociación duplicada. |
| [x] | T07 | Retirar un rol y reutilizar el mismo JWT todavía vigente. | Nueva operación denegada por el permiso revocado. |
| [x] | T08 | Dejar AUTH temporalmente inaccesible. | STEGO no procesa sin autorización comprobada. |
| [x] | T09 | Analizar una imagen original y una muestra con carga LSB. | Métricas, clasificación y limitaciones documentadas con resultados reales. |
| [x] | T10 | Subir archivo inválido, corrupto o demasiado grande. | Rechazo seguro, sin procesamiento indebido; aplicar 413/415 donde corresponda. |
| [x] | T11 | Consultar un análisis ajeno sin autorización. | Acceso denegado según la política de recursos. |
| [x] | T12 | Revisar bitácoras de accesos y análisis. | Trazabilidad sin secretos ni JWT completos. |

## 6. Checklist de sustentación y recepción

*Fuente: §3, p. 4, y bloque de recepción, p. 5.*

- [ ] **P01.** Presentar el repositorio, la documentación y las evidencias requeridas **el miércoles 04/11/2026, a la hora de clases**.
- [ ] **P02.** Ejecutar ambos servicios y demostrar que cada uno responde desde su propia API.
- [ ] **P03.** Crear un usuario con dos roles y asignar un mismo rol a dos usuarios; mostrar la persistencia N:M.
- [ ] **P04.** Iniciar sesión en AUTH y usar el JWT recibido para solicitar un análisis en STEGO.
- [ ] **P05.** Demostrar denegación sin token, con token inválido y sin privilegios.
- [ ] **P06.** Retirar el rol que permite la operación y demostrar que el **mismo JWT no expirado** ya no permite una nueva solicitud.
- [ ] **P07.** Dejar AUTH sin capacidad de responder con autorización válida y demostrar que STEGO falla de forma segura.
- [ ] **P08.** Analizar una imagen de referencia y otra con datos ocultos compatibles con el detector, mostrando resultados reales y explicando sus limitaciones.
- [ ] **P09.** Comprobar antes de entregar las dos condiciones expresas de incompletitud: no presentar un monolito como dos carpetas y no presentar detección simulada sin procesamiento real de archivos.

## 7. Precisiones para aplicar correctamente el enunciado

1. **El repositorio puede seguir siendo único.** Dos carpetas de aplicaciones separadas son válidas si representan procesos y despliegues realmente independientes; dos carpetas internas de un monolito no lo son.
2. **El modelo mínimo añade detalles concretos.** El anexo A exige `description` en `roles` y `id` propio más `UNIQUE(user_id, role_id)` en `user_roles`. La revisión de nuestra base debe comprobarlos explícitamente; una PK compuesta sola no reproduce la estructura solicitada.
3. **El contrato del parcial es la referencia para esta entrega.** Deben comprobarse los roles ADMIN/ANALYST/USER, `/auth/profile`, la eliminación de asignación por `:id`, la consulta interna de autorización y los dos endpoints STEGO. La autorización de listados de usuarios/roles es ADMIN. El taller previo no sustituye estas exigencias.
4. **PNG o BMP y prueba LSB.** La sección 2.3 permite seleccionar un formato y una técnica verificable; el escenario T09 concreta LSB. Como propuesta de alcance, elegir PNG con análisis estadístico LSB permite alinear ambos apartados. Esta elección es una propuesta, no una tecnología impuesta por el PDF.
5. **No copiar los números del ejemplo.** `anomaly_score: 0.82` y `threshold: 0.75` del anexo C son ilustrativos. El procedimiento, los parámetros y los resultados propios deben justificarse y medirse.
6. **No trasladar umbrales de trabajos anteriores como obligaciones.** Este PDF no fija TPR/FPR, latencias, cantidad mínima de riesgos ni una escala de puntuación de riesgos. Si el equipo los adopta, debe identificarlos como decisiones propias, sin sustituir las pruebas obligatorias.
7. **La autorización interna necesita dos identidades.** El JWT identifica al usuario; la autenticación entre servicios acredita a STEGO ante AUTH. Un token del usuario por sí solo no reemplaza la identidad del servicio.

## 8. Bibliografía que proporciona el PDF

*Fuente: §6, pp. 7-8. Conservar la correspondencia de estas referencias al fundamentar la documentación técnica; no atribuirles resultados que el equipo no haya verificado.*

| Ref. del PDF | Referencia | Aplicación en el trabajo |
|---|---|---|
| [1] | ISO/IEC 27001:2022. [Referencia](https://www.iso.org/standard/27001). | Principios de gestión de seguridad y controles pertinentes; sin afirmar certificación. |
| [2] | ISO/IEC 27034-1:2011, Overview and concepts. [Referencia](https://www.iso.org/standard/44378.html). | Principios de seguridad de aplicaciones. |
| [3] | OWASP ASVS 5.0.0 (2025). [Referencia](https://asvs.owasp.org/). | Referencia para verificaciones de seguridad de aplicaciones y pruebas tempranas. |
| [4] | OWASP File Upload Cheat Sheet. [Referencia](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). | Tratamiento y validación segura de archivos. |
| [5] | RFC 7519, JSON Web Token (2015). [Referencia](https://www.rfc-editor.org/rfc/rfc7519). | Contrato JWT y sus claims. |
| [6] | RFC 7517, JSON Web Key (2015). [Referencia](https://www.rfc-editor.org/rfc/rfc7517). | Referencia sobre representación de claves, cuando corresponda a la solución elegida. |
| [7] | RFC 8725, JWT Best Current Practices (2020). [Referencia](https://www.rfc-editor.org/rfc/rfc8725). | Buenas prácticas de firma y validación de JWT. |
| [8] | NIST SP 800-207, Zero Trust Architecture (2020). [Referencia](https://doi.org/10.6028/NIST.SP.800-207). | Verificación explícita de identidad y autorización, sin confianza implícita. |

## 9. Control de cobertura documental

La siguiente correspondencia registra dónde se recogen todas las partes del PDF, incluidos sus anexos, tablas, ejemplos y bibliografía. Es una comprobación de **cobertura del plan**, no una declaración de que el software ya cumple todos los requisitos.

| Parte del PDF | Páginas | Cobertura en este archivo |
|---|---|---|
| Encabezado, resumen, contexto, objetivo general y objetivos específicos (§§1-1.2) | 1-2 | Datos iniciales; análisis §1; A, I, J, R, S, C y E. |
| Alcance y exclusiones (§1.3) | 2 | §1 y precisiones §7. |
| Arquitectura y figura 1 (§2.1) | 2 | A01-A06 y D05. |
| AUTH (§2.2) | 2-3 | I01-I07, J01-J06 y R01-R08. |
| STEGO (§2.3) | 3 | S01-S12. |
| Comunicación y RBAC (§2.4) | 3 | C01-C10, R y J. |
| Contrato mínimo y reglas HTTP/OpenAPI (§2.5; tabla dividida entre páginas) | 3-4 | API01-API17. |
| Entregables, sustentación y recepción (§3 y recuadro de fecha) | 4-5 | D01-D10, E01-E08 y P01-P09. |
| Rúbrica, Cuadro 2 y escala de logro (§4) | 5 | §2, con los seis criterios, puntajes y fórmula. |
| Anexo A y Cuadro 3 (§5.1) | 5 | I01-I07, D06 y precisión 2. |
| Anexo B, contrato interno ilustrativo (§5.2) | 6 | C01-C10 y precisión 7. |
| Anexo C, contrato de análisis ilustrativo (§5.3) | 6 | S08-S12 y precisión 5. |
| Anexo D y Cuadro 4, T01-T12 (§5.4) | 6-7 | §5 completo y checklist de sustentación. |
| Anexo E y Cuadro 5 (§5.5) | 7 | E01-E03 y tabla de seis grupos de activos/amenazas/controles. |
| Bibliografía [1]-[8] (§6) | 7-8 | §8. |

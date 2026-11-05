# Backend V1: AUTH + STEGO

Dos microservicios del primer parcial, dentro del único repositorio del equipo:

```text
App/
├── ms-users/     AUTH: NestJS, TypeScript y PostgreSQL
├── ms-stego/     STEGO: FastAPI, Python y almacenamiento propio SQLite
├── docker-compose.yml
├── scripts/
├── tests/
└── docs/
```

AUTH administra identidades N:M, credenciales y permisos. STEGO recibe PNG, verifica el JWT, consulta la autorización vigente en AUTH y calcula indicadores estadísticos sobre los bits menos significativos. PostgreSQL y los volúmenes son infraestructura de apoyo.

## Preparación e inicio

Requisitos: Git, Node.js 24 y npm, Docker Desktop con contenedores Linux y Docker Compose que admita `!override` para la suite de pruebas (2.24.4 o posterior). OpenSSL debe estar disponible; en Windows el inicializador busca también el incluido con Git. Python 3.12 solo se necesita en el host para ejecutar las pruebas Python, no para iniciar los contenedores.

Desde una copia nueva:

```sh
git clone https://github.com/arieleMM-dev/SecureShop_Lugma-a_Morillo_Villacres.git
cd SecureShop_Lugma-a_Morillo_Villacres/App/ms-users
npm ci
cd ..
node scripts/init-env.cjs
node scripts/compose.cjs up -d --build --wait
node scripts/compose.cjs exec auth node dist/database/seed.js
```

En una copia existente, empezar en `App/ms-users` y omitir la clonación. Revisar los `.env` locales después del inicializador: conserva los secretos existentes y genera los que faltan. No publicar esos archivos. STEGO recibe exclusivamente la clave pública JWT, la CA pública y su credencial de servicio, nunca el `.env` completo de AUTH. El script sincroniza emisor y audiencia con la configuración real de AUTH.

Los certificados locales duran 30 días. Para renovarlos, detener AUTH, respaldar el material de TLS y retirar únicamente el certificado y la clave de servidor vencidos; ejecutar de nuevo el inicializador y reiniciar los servicios. No retirar las claves JWT ni los datos. La CA también debe estar vigente; su renovación requiere distribuir la nueva CA a los clientes. No desactivar la validación TLS.

Si se ejecutaba previamente el Compose individual de `ms-users`, detenerlo antes de iniciar el conjunto para evitar puertos ocupados. El Compose de `App` usa otro proyecto y otro volumen de PostgreSQL: una base nueva requiere la siembra indicada. No ejecutar dos AUTH distintos suponiendo que comparten usuarios o resultados.

| Servicio | API local | Documentación interactiva |
|---|---|---|
| AUTH | `https://localhost:3443/api/v1` | `https://localhost:3443/docs` |
| STEGO | `http://localhost:8000/api/v1/steganography` | `http://localhost:8000/docs` |

El puerto HTTP 3001 de AUTH y el 8000 de STEGO se publican únicamente en loopback para desarrollo. El canal STEGO → AUTH utiliza siempre HTTPS/TLS 1.3 con CA verificada y credencial de servicio. Para clientes remotos se requiere terminar TLS también delante de STEGO; este Compose no publica un servicio HTTPS externo.

Cuentas de desarrollo: `jperez` ADMIN, `amendoza` ANALYST, `mgomez` USER, `cvega` USER+ANALYST y `lcastro` USER. La contraseña se consulta localmente en `ms-users/.env`, campo `SEED_PASSWORD`. No se incluye en este documento. La siembra no cambia contraseñas de usuarios ya existentes y está limitada a desarrollo.

## Uso

1. Solicitar `POST /api/v1/auth/login` a AUTH con JSON `{"identifier":"amendoza","password":"<SEED_PASSWORD local>"}`.
2. Copiar el `accessToken` recibido. Enviar a STEGO `POST /api/v1/steganography/analyze` con `Authorization: Bearer <token>` y un formulario multipart con un único campo de archivo `file`. Usar las muestras de `docs/pruebas/muestras/`.
3. Consultar `GET /api/v1/steganography/results/<analysis_id>` con el mismo encabezado. ANALYST solo accede a sus resultados; ADMIN puede acceder a todos; USER no tiene permiso.
4. Importar la [colección REST conjunta](docs/pruebas/backend-v1.postman_collection.json) y configurar sus variables privadas. Añadir `ms-users/secrets/ca.crt` a los certificados confiables del cliente HTTPS. Usar `docs/pruebas/muestras` como carpeta de trabajo de Postman. En **Analizar imagen** se puede seleccionar un PNG y usar el JWT de ANALYST o ADMIN. **Consultar resultado** usa el ID del análisis. Seguir el [guion actualizado](docs/05_guion_sustentacion_postman.md).

La autorización se obtiene de nuevo en cada operación. Cambiar roles o cerrar sesión en AUTH afecta a la siguiente solicitud aunque el JWT todavía no haya expirado.

## Operación independiente

Desde `App`:

```sh
node scripts/compose.cjs stop stego
node scripts/compose.cjs start stego
node scripts/compose.cjs stop auth
node scripts/compose.cjs start auth
node scripts/compose.cjs logs --tail 50 stego
node scripts/compose.cjs down
```

AUTH sigue respondiendo con STEGO detenido. STEGO conserva su API y almacenamiento si AUTH cae, pero deniega el análisis sin autorización vigente. `down` conserva los volúmenes; no añadir `--volumes` a la ejecución normal si se desea preservar los datos. Las migraciones de AUTH se ejecutan al iniciar su contenedor. STEGO crea su esquema SQLite versión 1 de forma idempotente.

## Pruebas reproducibles

Con Python 3.12, desde `App`:

```sh
python -m venv ms-stego/.venv
ms-stego/.venv/Scripts/python.exe -m pip install -r ms-stego/requirements-dev.txt
ms-stego/.venv/Scripts/python.exe -m pytest -q ms-stego/tests -c ms-stego/pytest.ini
ms-stego/.venv/Scripts/python.exe tests/run.py
```

En Linux/macOS sustituir el ejecutable por `ms-stego/.venv/bin/python`. El ejecutor crea un nombre de proyecto, puertos y volúmenes temporales, construye las imágenes, prepara identidades y ejecuta las pruebas reales; al terminar elimina exclusivamente los recursos de ese proyecto temporal. No usa ni elimina los volúmenes normales. Necesita Docker iniciado y la configuración preparada con el inicializador. Los registros JSON de prueba se regeneran en `docs/pruebas/resultados/`.

Con Postman CLI instalado, `ms-stego/.venv/Scripts/python.exe tests/run.py --postman` repite también el ensayo de la colección y guarda su salida depurada.

Para regenerar las muestras, desde `App/ms-stego`: `.venv/Scripts/python.exe -m scripts.generate_samples`. El generador comprueba la recuperación del mensaje insertado; se incluyen ejemplos con falso positivo y falso negativo. No es un corpus independiente de evaluación de precisión.

Las pruebas previas de AUTH se conservan en su documentación. Las pruebas del conjunto cubren T01-T12 con ambos servicios reales; [mapa de evidencias](docs/04_pruebas_y_evidencias.md). Las casillas de presentación en clase continúan pendientes.

## Entregables

El [mapa de cumplimiento](docs/00_mapa_cumplimiento.md) relaciona la consigna con el código, la configuración y las evidencias. La documentación de entrega está reunida en [App/docs](docs/README.md). Cada servicio conserva su [guía AUTH](ms-users/README.md) o [guía STEGO](ms-stego/README.md) para ejecución independiente.

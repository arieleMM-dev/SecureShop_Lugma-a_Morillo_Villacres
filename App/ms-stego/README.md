# ms-stego — STEGO Backend V1

Microservicio REST FastAPI/Python 3.12 para analizar PNG de 8 bits con un contraste estadístico de equiprobabilidad entre pares de valores LSB. Verifica JWT RS256 y consulta permisos vigentes en AUTH por HTTPS en cada operación protegida. Mantiene resultados, auditoría y cuarentena propios; no accede a las identidades de AUTH.

## Preparación y arranque independiente

Consultar primero la [guía del conjunto](../README.md) para preparar configuración, claves públicas y CA. Este servicio tiene su propio Dockerfile, dependencias, `.env.example` y proceso. Desde `App`, con configuración preparada:

```sh
node scripts/compose.cjs up -d --build stego
node scripts/compose.cjs stop stego
node scripts/compose.cjs start stego
```

Puede iniciarse aunque AUTH esté detenido: `/health` responde, pero las operaciones protegidas fallan sin autorización. Para analizar se necesita AUTH operativo y usuarios/roles persistidos. Swagger: `http://localhost:8000/docs`; [OpenAPI exportado](docs/openapi.json).

Ejecución nativa Linux: preparar un entorno Python 3.12, instalar `requirements.txt` y la biblioteca del sistema `libseccomp2`; desde esta carpeta ejecutar `uvicorn app.main:app --host 127.0.0.1 --port 8000`. Ajustar `.env` con rutas de CA y pública existentes. El trabajador requiere Linux por defecto. Windows sirve para las pruebas del cálculo y API simulada; los análisis aislados reales se ejecutan en el contenedor Linux. No deshabilitar `REQUIRE_SANDBOX` para la entrega.

## API

| Método y ruta | Entrada | Resultado y control |
|---|---|---|
| POST `/api/v1/steganography/analyze` | Bearer y multipart con un único archivo `file` | ADMIN o ANALYST; clasificación, métricas, SHA-256, propietario y política |
| GET `/api/v1/steganography/results/{analysis_id}` | Bearer e ID UUID | ANALYST propietario o ADMIN; metadatos persistidos, sin entregar el archivo |
| GET `/health` | Sin credenciales | Salud del proceso; no acredita disponibilidad de AUTH |

`analysis_id`, `user_id`, `filename`, `sha256`, `technique`, `indicators`, `created_at`, `status`, `action` y `limitations` forman la respuesta. Los estados son `sin_indicios`, `sospechoso`, `no_concluyente` y `error`; los tres primeros resultan de procesamiento válido. Un error del decodificador o del trabajador no se transforma en un análisis limpio.

| HTTP | Significado |
|---|---|
| 400 | Multipart inválido, ID inválido o PNG corrupto |
| 401 | JWT ausente, inválido, vencido o sesión revocada |
| 403 | Usuario sin permiso o resultado ajeno |
| 404 | Resultado inexistente tras autorización |
| 413 | Archivo, cuerpo o dimensiones superiores al límite |
| 415 | Extensión, MIME, firma o variante PNG no admitidos |
| 502 | Decisión AUTH con contenido no verificable |
| 503 | AUTH inaccesible, fallo del trabajador, tiempo agotado o capacidad ocupada |

El cuerpo multipart no se lee antes de la autorización. Las peticiones denegadas no generan análisis. Los rechazos de formato previos al trabajador se auditan y no generan resultado de análisis. Cuando un PNG con firma válida llega al trabajador y este devuelve error, se guarda el estado `error`, el hash y la política, y la respuesta usa el código apropiado con `analysis_id`.

## Configuración y límites

| Variables | Valor inicial y finalidad |
|---|---|
| `AUTH_BASE_URL`, `AUTH_CA_PATH` | Origen HTTPS configurable y CA confiable; sin redirecciones ni verificación desactivada |
| `AUTH_PUBLIC_KEY_PATH` | Clave pública RSA ≥ 3072 bits; solo verificación |
| `AUTH_SERVICE_TOKEN` | Credencial aleatoria de servicio sincronizada con AUTH; privada |
| `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE` | Valores sincronizados desde AUTH |
| `AUTH_TIMEOUT` | 3 s por fase de transporte HTTPX; no es una garantía de duración total de la solicitud |
| `MAX_FILE_BYTES` | 5 MiB por archivo; cuerpo multipart limitado a ese valor + 64 KiB |
| `MAX_DIMENSION`, `MAX_PIXELS` | 2048 por lado y 4 194 304 píxeles |
| `WORKER_TIMEOUT`, `WORKER_MEMORY_MB` | 10 s de pared y 512 MiB de espacio virtual por trabajador; CPU = techo de timeout/2, inicialmente 5 s |
| `MAX_JOBS` | Dos trabajadores simultáneos; capacidad ocupada → 503 |
| `DATA_DIR`, `QUARANTINE_DAYS` | SQLite y archivos propios; retención de archivos de cuarentena 7 días |
| `REQUIRE_SANDBOX` | `true`; error seguro si no puede activar el aislamiento Linux |

El trabajador recibe una ruta UUID interna y parámetros numéricos; su entorno no hereda credenciales de servicio, JWT ni configuración de base de datos. No ejecuta contenido de la imagen. Después de importar bibliotecas, limita CPU/memoria y deniega llamadas de red con seccomp antes de decodificar. Contenedor sin root, sin capacidades, raíz de solo lectura y `/tmp` acotado. Los límites se aplican por proceso/instancia; no sustituyen una política global de capacidad para múltiples réplicas.

## Persistencia y política

`/data/stego.sqlite3` registra análisis y auditoría mediante parámetros SQL. `quarantine/<UUID>.bin` usa nombres del servidor y permisos privados; no hay ruta pública ni descarga. Un resultado `sin_indicios` genera advertencia sobre las limitaciones y elimina el archivo después de guardar las métricas. `sospechoso`, `no_concluyente` o `error` se aíslan en cuarentena. Una tarea al arrancar y cada 60 s elimina archivos vencidos; los metadatos permanecen. El reinicio conserva el volumen. No se define retención indefinida para producción: el plazo de metadatos deberá acordarse antes de operar con datos personales.

## Método, muestras y pruebas

- [Procedimiento y límites estadísticos](docs/METODOLOGIA.md).
- [Muestras y verdad de construcción](samples/manifest.json): control, carga LSB alta, baja carga, ruido sin mensaje y muestra pequeña.
- [Pruebas del conjunto y su reproducción](../docs/PRUEBAS.md).
- [Riesgos y controles](../docs/RIESGOS.md).

Un indicio no demuestra un mensaje oculto. Las muestras incluyen explícitamente un falso positivo y un falso negativo. No se declara precisión de producción ni cobertura frente a técnicas diferentes de la equiprobabilidad LSB.

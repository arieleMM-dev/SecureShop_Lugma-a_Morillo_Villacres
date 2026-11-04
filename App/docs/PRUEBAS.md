# Pruebas y evidencias del conjunto

Ejecutar los comandos de [App/README](../README.md#pruebas-reproducibles). La suite de integración construye dos imágenes independientes y utiliza PostgreSQL y SQLite reales, volúmenes nuevos y puertos temporales; se limpian solo esos recursos al finalizar. Las llamadas asíncronas de las pruebas unitarias de fallos utilizan respuestas simuladas para explorar decisiones inválidas sin modificar AUTH.

## Resultados conservados

- STEGO: **14 casos unitarios aprobados**, incluidos cálculo, carga LSB recuperable, retención, OpenAPI, siete formas de fallo/denegación de AUTH y rechazo antes de leer el cuerpo. [Salida](../ms-stego/docs/pruebas-unitarias.txt).
- Conjunto AUTH+STEGO: **14 comprobaciones integradas aprobadas**, que cubren los doce escenarios T01-T12 agrupando T05/T06 y añadiendo aislamiento, logout y persistencia. [Resultado con fecha de ejecución UTC](../ms-stego/docs/pruebas-integracion.json).
- AUTH V2 previo: [7 pruebas unitarias](../ms-users/docs/pruebas-unitarias-auth-v2.txt) y [32 pruebas funcionales/seguridad](../ms-users/docs/pruebas-auth-v2.txt), conservadas de la implementación anterior. No se presentan como reejecutadas en esta fase.
- [Resultados completos por API de las cinco muestras](../ms-stego/docs/resultados-ejecucion.json), [verdad de construcción y métricas](../ms-stego/samples/manifest.json) y [auditoría sin credenciales](../ms-stego/docs/auditoria-ejecucion.json).

La fecha UTC puede pertenecer al día siguiente de la fecha local Ecuador (UTC−5). Los UUID/horas cambian al repetir la suite; los hashes y cálculos de las imágenes generadas son reproducibles con las dependencias fijadas. Los usuarios de prueba se crean en una base temporal; los UUID publicados en evidencia no identifican cuentas del despliegue normal.

## Trazabilidad de escenarios

| Escenario PDF | Comprobación ejecutada | Riesgos relacionados |
|---|---|---|
| T01 | Detener/iniciar STEGO sin interrumpir AUTH; detener/iniciar AUTH manteniendo salud STEGO durante T08 | M04 |
| T02 | Login válido devuelve JWT; contraseña incorrecta → 401 | M01 |
| T03 | JWT ausente, inválido, alterado y vencido → 401 sin fila nueva de análisis | M03 |
| T04 | USER → 403 incluso con cabeceras falsas ADMIN | M02 |
| T05 | Usuario USER+ANALYST y ANALYST compartido por usuarios; persistencia N:M preparada por seed y contrastada con API | M02 |
| T06 | Repetición del par usuario/rol → 409; la prueba AUTH previa también comprueba la asignación | M02 |
| T07 | Retirar ANALYST, reutilizar el mismo JWT y comprobar 403 sin análisis; restaurar el rol | M02 |
| T08 | Detener AUTH; STEGO /health responde y carga devuelve 503 sin fila nueva; reiniciar AUTH | M04 |
| T09 | Control y carga LSB real → indicadores y estados distintos; medir también ruido, baja carga y muestra insuficiente | M05, M07 |
| T10 | Firma falsa, extensión/MIME incompatibles, PNG truncado, archivo >5 MiB y dimensiones excesivas → rechazo apropiado | M05 |
| T11 | ANALYST propietario → 200; otro ANALYST → 403; ADMIN → 200 | M06 |
| T12 | Auditoría incluye peticiones denegadas, indisponibilidad y analysis_id; no contiene tokens completos, contraseña ni credencial de servicio | M01, M03, M06 |

Adicionalmente: prueba dentro del contenedor de UID no root, ausencia de variables DB_ y clave privada JWT, y creación de socket denegada tras activar seccomp; logout invalida el mismo JWT ante STEGO; reinicio STEGO conserva resultados. Las pruebas unitarias de autorización rechazan timeout, JSON inválido, booleano textual, sujeto/recurso incorrectos, 401 y denegación explícita. La prueba del middleware confirma que no se lee el archivo ni se invoca la aplicación cuando falta permiso.

No se ha ejecutado una evaluación estadística independiente, una prueba de carga masiva o una certificación de seguridad. La sustentación en clase y la publicación/entrega del repositorio corresponden al equipo; las evidencias locales no las sustituyen.

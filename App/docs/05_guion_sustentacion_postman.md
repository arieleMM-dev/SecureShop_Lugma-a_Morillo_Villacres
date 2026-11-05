# Guion de sustentación en Postman

Usar las solicitudes de la [colección del Backend V1](pruebas/backend-v1.postman_collection.json) de forma individual y en el orden de este guion. Los pasos cambian el estado de la base de desarrollo. Conservar los identificadores de las asignaciones y usar cuentas de demostración.

## 1. Levantar el proyecto y preparar el cliente

Con Docker Desktop iniciado y una terminal situada en `App`:

```powershell
node scripts/init-env.cjs
node scripts/compose.cjs up -d --build --wait
node scripts/compose.cjs exec auth node dist/database/seed.js
node scripts/compose.cjs ps
```

En Postman Desktop, importar el archivo JSON de la colección. En **Settings → App settings → Certificates**, activar **CA Certificates** y seleccionar `App/ms-users/secrets/ca.crt` (certificado CA en formato PEM). Mantener activa la verificación TLS. [Instrucciones oficiales de Postman](https://learning.postman.com/docs/use/send-requests/authorization/certificates).

| Variable | Valor para ejecución local |
|---|---|
| `base_url` | `https://localhost:3443/api/v1` |
| `internal_url` | `https://localhost:3443` |
| `stego_url` | `http://localhost:8000` |
| `seed_password` | Valor local de `SEED_PASSWORD` en `App/ms-users/.env` |
| `new_user_password` | Contraseña temporal de 12 a 128 caracteres que el equipo elija para la cuenta de demo |
| `access_token`, `analyst_token`, `user_token`, `other_analyst_token`, `demo_token` | Los guardan las solicitudes de login. Son credenciales locales. |
| `user_id`, `role_id`, `assignment_id`, `analysis_id` | UUID de las respuestas. El análisis autorizado guarda `analysis_id`. |

`service_token` se usa únicamente si se va a demostrar el endpoint interno directamente con Postman. La operación normal STEGO → AUTH usa la credencial configurada en los contenedores. Guardar contraseñas y tokens como valores locales de Postman y evitar incluirlos en capturas, repositorio o exportaciones.

## 2. Mostrar independencia y autenticación

1. Ejecutar **Health** de AUTH y **Salud STEGO**. Deben devolver 200 y sus propios nombres de servicio.
2. En la terminal, ejecutar `node scripts/compose.cjs stop stego` y volver a ejecutar **Health** de AUTH. Debe devolver 200. Ejecutar `node scripts/compose.cjs start stego` y confirmar su salud. La independencia de STEGO ante la caída de AUTH se muestra en el paso 7.
3. Ejecutar **Login ADMIN** para `jperez`. Debe devolver 200 con `accessToken`, `tokenType`, `expiresIn` y `user`. La colección guarda el token en `access_token`. Probar **Perfil** con ese token.
4. Duplicar el login en una solicitud de prueba y enviar una contraseña incorrecta. Debe devolver 401. El límite del login es 5 solicitudes por minuto por origen; distribuir los logins del guion si aparece 429.

## 3. Crear un usuario y demostrar N:M

1. Abrir **Crear usuario** con Bearer `{{access_token}}`. Reemplazar su JSON por el siguiente y enviar. Para repetir el ensayo, usar valores únicos nuevos de cédula, teléfono, correo y usuario, y usar el mismo identificador elegido en el login de demo.

```json
{
  "cedula": "1799999001",
  "nombres": "Cuenta",
  "apellidos": "Demostracion",
  "fechaNacimiento": "1998-04-18",
  "username": "demoparcial",
  "email": "demoparcial@example.com",
  "telefono": "0990009001",
  "password": "{{new_user_password}}",
  "estado": true
}
```

2. Esperar 201 y guardar el `id` como `user_id`. Ejecutar **Listar roles** sin parámetros y anotar los UUID de `USER` y `ANALYST`. La respuesta debe mostrar `meta.page = 1` y `meta.limit = 20`.
3. Ejecutar **Asignar rol** dos veces con el mismo `user_id`, primero con `role_id` de USER y luego de ANALYST. Cada POST debe devolver 201. Ejecutar **Consultar asignaciones** para confirmar ambas filas.
4. Ejecutar **Listar usuarios** y anotar el ID de `amendoza`. Consultar sus asignaciones usando temporalmente ese ID como `user_id`. Debe compartir el mismo UUID de ANALYST que se asignó a la cuenta nueva. Guardar el ID de la asignación ANALYST de `amendoza`, que luego servirá para la revocación.
5. Volver a la cuenta nueva y repetir su asignación ANALYST. Debe devolver 409 por el par duplicado. Ejecutar **Login usuario nuevo de demostración** y comprobar que la cuenta tiene USER y ANALYST. Si se cambió el identificador en el paso 1, ajustar el cuerpo de la solicitud de login.

## 4. Analizar y consultar resultados

1. Ejecutar **Login ANALYST** para `amendoza`. Usar `{{analyst_token}}` en **Analizar como ANALYST**.
2. En **Body → form-data**, usar una sola clave `file` con tipo **File** y elegir `original_control.png` de [las muestras](pruebas/muestras/manifest.json). Postman debe generar el encabezado multipart con su delimitador. Esperar 200 y `sin_indicios`.
3. En la misma solicitud, elegir `oculta_lsb.png`. Esperar 200, `sospechoso` y `cuarentena`. Mostrar `analysis_id`, `user_id`, `sha256`, `technique`, `indicators` y `created_at`. La colección guarda el ID más reciente.
4. Ejecutar **Consultar propio ANALYST**. Debe devolver 200 con el mismo ID. Ejecutar **Login segundo ANALYST (cvega)** y **Consultar resultado ajeno como otro ANALYST**. Debe devolver 403. **Consultar como ADMIN** debe devolver 200.
5. Explicar que el detector calcula un indicio estadístico. `ruido_sin_mensaje.png` ilustra un falso positivo; `oculta_baja_carga.png`, un falso negativo; `pequena.png`, un caso no concluyente. Los resultados provienen de muestras sintéticas y muestran el alcance del método. [Método y limitaciones](02_seguridad_contratos_y_metodo.md#método-de-análisis-esteganográfico).

## 5. Verificar rechazos

| Caso | Qué enviar | Resultado |
|---|---|---|
| Falta JWT | **Carga sin JWT** con un PNG | 401 |
| JWT inválido | **Carga con JWT inválido** con un PNG | 401 |
| JWT vencido | Reusar un token después de `exp`, o mostrar T03 automatizada que genera uno vencido | 401 |
| Falta permiso | **Login USER** para `mgomez` y **USER sin permiso** con un PNG | 403 |
| Formato incompatible | Usar la carga de ANALYST y seleccionar un archivo JPG, o un archivo con firma falsa | 415 |
| PNG corrupto | Usar un PNG truncado que conserve su firma | 400 |
| Exceso | Archivo PNG de más de 5 MiB con configuración predeterminada | 413 |

Para reproducir los dos últimos casos con PowerShell desde `App`, crear archivos temporales con nombres propios del ensayo:

```powershell
$demoPng = [IO.File]::ReadAllBytes((Resolve-Path 'docs/pruebas/muestras/original_control.png').Path)
[IO.File]::WriteAllBytes((Join-Path $env:TEMP 'demo-parcial-truncado.png'), $demoPng[0..39])
[IO.File]::WriteAllBytes((Join-Path $env:TEMP 'demo-parcial-grande.png'), (New-Object byte[] 5242881))
```

En estos rechazos, la aserción de una solicitud de éxito seguirá esperando 200. Para el ensayo manual, evaluar el HTTP indicado en esta tabla. T10 automatizada comprueba también MIME, firma, extensión y dimensiones.

## 6. Retirar un rol y reutilizar exactamente el mismo JWT

1. Con el token de ADMIN, poner el ID de la asignación ANALYST de `amendoza` en `assignment_id` y ejecutar **Retirar asignación por id**. Esperar 204. Es el UUID de la fila de asignación, distinto del UUID del rol.
2. Ejecutar **Carga después de retirar ANALYST**, seleccionando el mismo PNG. Usar el valor anterior de `analyst_token` mientras siga vigente, sin volver a iniciar sesión como `amendoza`. Debe devolver 403. STEGO verifica el token y AUTH consulta los permisos actuales.
3. Restaurar el rol con **Asignar rol**, usando los UUID del usuario `amendoza` y de ANALYST. Esperar 201. Reintentar el análisis con el mismo JWT mientras siga vigente y comprobar 200.

## 7. Demostrar el fallo seguro

1. Con un JWT de ANALYST vigente y el rol restaurado, ejecutar en terminal `node scripts/compose.cjs stop auth`.
2. Ejecutar **Salud STEGO** y verificar 200. En **Carga con AUTH detenido**, seleccionar el PNG y enviar el JWT vigente. Esperar 503 sin resultado nuevo. El rechazo ocurre antes de que STEGO procese la imagen.
3. Restaurar AUTH con `node scripts/compose.cjs start auth`, comprobar su salud y repetir el análisis autorizado. Si expiró el JWT durante la sesión, obtener otro antes de la prueba de recuperación.
4. Si se desea mostrar logout, cerrar la sesión de prueba al final y comprobar que el mismo token devuelve 401 al volver a llamar a STEGO.

## 8. Mostrar auditoría y cerrar

Mostrar el `X-Request-Id` de una operación exitosa y de un rechazo. Contrastar los campos de auditoría con los archivos [AUTH](pruebas/resultados/auth-auditoria-ejemplo.json) y [STEGO](pruebas/resultados/stego-auditoria.json). Para ver las últimas filas de STEGO de la ejecución en curso, desde `App`:

```powershell
node scripts/compose.cjs exec -T stego python -c "import sqlite3; db=sqlite3.connect('/data/stego.sqlite3'); print(*db.execute('SELECT request_id, route, status_code, analysis_id FROM audit_events ORDER BY id DESC LIMIT 10'), sep=chr(10))"
```

Identificar una operación procesada con `analysis_id` y un rechazo de carga por caída de AUTH sin `analysis_id`. Mostrar estado, ruta e identificador de correlación. La [suite de integración](04_pruebas_y_evidencias.md) conserva las pruebas reproducibles y el informe T01–T12.

Para finalizar el ensayo, `node scripts/compose.cjs down` detiene el conjunto y conserva los volúmenes.

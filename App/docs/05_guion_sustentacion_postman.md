# Guion de sustentación en Postman desde cero

Esta guía usa Windows, Docker Desktop y la colección **Backend V1 AUTH + STEGO (simplificada)**. La terminal sirve para iniciar y detener los servicios. Postman sirve para enviar solicitudes y ver las respuestas. Durante el ensayo vas a alternar entre esas dos ventanas.

- [Preparación](#preparación)
- [T01–T12, uno por uno](#t01-independencia-de-los-servicios)
- [Anexo B, qué hace STEGO internamente](#anexo-b-la-decisión-interna)
- [Anexo C, cómo leer el resultado](#anexo-c-el-resultado-del-análisis)
- [Todas las solicitudes de la colección](#para-qué-sirve-cada-solicitud)

## ¿Cumplimos la independencia?

Sí. AUTH se construye con su propio Dockerfile y ejecuta un proceso NestJS. STEGO se construye con otro Dockerfile y ejecuta un proceso Python con Uvicorn. Compose permite seleccionar cuál construir, iniciar o detener. T01 comprueba la salud de AUTH con STEGO detenido. T08 comprueba la salud de STEGO con AUTH detenido y demuestra que el análisis se rechaza. [Dockerfile AUTH](../ms-users/Dockerfile) · [Dockerfile STEGO](../ms-stego/Dockerfile) · [Compose](../docker-compose.yml) · [Evidencia automatizada](pruebas/resultados/integracion-auth-stego.json)

PostgreSQL es infraestructura de AUTH. STEGO puede arrancar y responder en `GET /health` por su cuenta. Para analizar necesita contactar con un AUTH configurado y obtener permiso. Esa dependencia de autorización es precisamente el control que pide la consigna.

## Preparación

### Abre la terminal y levanta los servicios

1. Pulsa la tecla **Windows**, busca **Docker Desktop**, ábrelo y espera a que el motor esté en funcionamiento.
2. Pulsa **Windows**, escribe **PowerShell** y abre el resultado. Pega esta línea y pulsa **Enter**. Si el repositorio está en otra carpeta, usa la ruta de su carpeta `App`.

   ```powershell
   cd "C:\Users\ariel\Desktop\UNI\Software\09-02 2627\SSeguro\App"
   ```

3. Pega el comando siguiente y pulsa **Enter**. La primera construcción puede demorar. Espera a que vuelva a aparecer el indicador `PS ...>`.

   ```powershell
   node scripts/compose.cjs up -d --build --wait
   ```

4. Ejecuta `node scripts/compose.cjs ps`. Busca las filas `auth`, `stego` y `postgres` en ejecución. Si estás usando por primera vez la base del Compose conjunto, ejecuta también `node scripts/compose.cjs exec auth node dist/database/seed.js` para crear las cuentas de prueba. Si ya iniciaste sesión en Postman con esa misma base, las cuentas ya están preparadas.
5. Deja PowerShell abierto. Los demás comandos de esta guía se pegan en esa misma ventana.

Si partes de una copia nueva y faltan la configuración o las claves, sigue los pasos de preparación del [README de App](../README.md) antes de volver al paso 3.

### Prepara Postman

1. Abre **Postman Desktop**. Pulsa **Import** y selecciona [backend-v1.postman_collection.json](pruebas/backend-v1.postman_collection.json). Usa la colección que dice **(simplificada)** y comprueba que la carpeta STEGO tenga solo **Analizar imagen** y **Consultar resultado**. En la vista local de Postman con Git, se actualizó también la copia YAML. [Importación en Postman](https://learning.postman.com/docs/getting-started/importing-and-exporting/importing-data)
2. Si ya obtuviste `200 OK` en **Health** sin advertencia de certificado, puedes seguir. Si no, abre **Settings → App settings → Certificates**, activa **CA Certificates** y elige `App/ms-users/secrets/ca.crt`. Deja activa la verificación TLS. [Certificados en Postman](https://learning.postman.com/docs/use/send-requests/authorization/certificates)
3. En **Settings → General → Working directory**, selecciona la carpeta `App/docs/pruebas/muestras`. Es la **carpeta** que contiene los PNG. [Carpeta de trabajo en Postman](https://learning.postman.com/docs/getting-started/installation/settings/working-directory)
4. En la parte superior derecha, si hay un entorno activo que no usas para esta colección, abre el selector y elige **No environment** o la opción equivalente sin entorno. Así la colección usa sus propios valores de `base_url`, `stego_url` y los tokens que guarda el login. Un entorno con una variable del mismo nombre podría usar otro valor. [Prioridad de variables](https://learning.postman.com/docs/use/send-requests/variables/managing-environments)
5. En la barra izquierda, pulsa el título **Backend V1 AUTH + STEGO (simplificada)** y luego **Variables**. En `seed_password`, pega el valor de `SEED_PASSWORD` de tu `App/ms-users/.env` local. Para encontrarlo, abre ese archivo en el editor y busca `SEED_PASSWORD=`. Copia solo lo que está a la derecha del signo igual. En `new_user_password`, pon una contraseña temporal de al menos 12 caracteres para las cuentas de prueba. Mantén esos valores locales. Pulsa **Save** si Postman muestra ese botón. [Variables de colección](https://learning.postman.com/docs/use/send-requests/variables/define-variables)
6. Comprueba que `base_url` sea `https://localhost:3443/api/v1`, `internal_url` sea `https://localhost:3443` y `stego_url` sea `http://localhost:8000`, si usas los puertos predeterminados.

### Aprende los cuatro movimientos que vas a repetir

| Si la guía dice… | Haz esto |
|---|---|
| **Abre una solicitud** | En la columna izquierda, despliega la colección y la carpeta **AUTH** o **STEGO** con la flecha. Pulsa el nombre exacto de la solicitud. Se abre en el panel de la derecha. |
| **Cambia el cuerpo JSON** | En el panel de la solicitud, pulsa **Body → raw**. El formato debe ser **JSON**. Pega el texto en el cuadro de edición. |
| **Adjunta un PNG** | Pulsa **Body → form-data**. En la fila `file`, selecciona **File** junto al nombre. En **Value**, quita el archivo anterior si aparece y selecciona el nuevo desde tu equipo. Debe verse el nombre del PNG. El archivo predeterminado es `original_control.png`, relativo a la carpeta de trabajo. Postman genera el encabezado multipart. |
| **Envía y mira el resultado** | Pulsa **Send** arriba a la derecha. Abajo mira primero el código, por ejemplo `200 OK`. En el **Body de la respuesta**, más abajo, están los datos que devolvió el servidor. En sus **Headers** está `X-Request-Id`. |

Las palabras entre llaves, como `{{analyst_token}}`, son espacios que Postman rellena con un valor. Si digo «guarda un valor en `user_id`», pulsa el título de la colección → **Variables** → fila `user_id`, pega el UUID sin comillas y vuelve a la solicitud. Un **UUID** es el texto largo con guiones que identifica un usuario, un rol, una asignación o un análisis. Usa siempre el ID del objeto que pide el paso.

### Usa las mismas dos solicitudes para todos los casos de STEGO

1. Para obtener el JWT de ADMIN, usa **AUTH → Login ADMIN**. Para otra cuenta, abre **AUTH → Login de prueba → Body → raw → JSON**. Cambia únicamente `identifier` y pulsa **Send**. Para una cuenta de seed, deja `"password": "{{seed_password}}"`. Para la cuenta que creaste en el ensayo, usa `{{new_user_password}}`.
2. Abre **STEGO → Analizar imagen** o **Consultar resultado** y pulsa **Headers**. Edita el **Value** de la fila `Authorization`. Deja una sola fila activa con ese nombre. Para el caso sin JWT, desmarca esa fila y usa **Authorization → No Auth** si hay autenticación heredada. Marca de nuevo la fila al volver a los casos con token.
3. Para analizar con permiso, en **Body → form-data** selecciona un PNG en `file`. Para comprobar solo `401` o `403`, puedes elegir **Body → none**. Si Postman muestra `EISDIR`, la solicitud todavía no llegó a la API. Comprueba la carpeta de trabajo o vuelve a elegir el archivo en la fila `file`.
4. `Analizar imagen` guarda `analysis_id` solo al recibir `200`. `Consultar resultado` usa ese ID en la URL y no lleva archivo. Puedes fijar otro ID desde **Variables**.

| Cuenta | Valor de Authorization que usas |
|---|---|
| `amendoza` (ANALYST) | `Bearer {{analyst_token}}` |
| `jperez` (ADMIN) | `Bearer {{access_token}}` |
| `mgomez` (USER) | `Bearer {{user_token}}` |
| `cvega` (otro ANALYST) | `Bearer {{other_analyst_token}}` |
| Cuenta nueva de prueba | `Bearer {{demo_token}}` |

Los ejemplos de respuesta están debajo de cada solicitud, tanto en el JSON importable como en la copia YAML. Sirven para ver el cuerpo esperado sin enviar una solicitud. Para demostrar el parcial, usa **Send** y muestra el código y cuerpo reales. [Contratos y tipos de respuesta](02_seguridad_contratos_y_metodo.md#contratos-openapi)

Los códigos de esta demo significan lo siguiente. `200` es éxito, `201` es creación y `204` es éxito sin cuerpo. `401` indica que no se pudo autenticar la solicitud y `403` indica falta de permiso. `409` indica conflicto, por ejemplo una asignación duplicada. `429` indica demasiados intentos. El login admite cinco intentos por minuto por origen, así que si ves `429`, espera un minuto antes de reintentar. El JWT dura **15 minutos** en tu configuración local.

## T01. Independencia de los servicios

1. **Postman.** Pulsa **AUTH → Health → Send**. Espera `200` y `"service": "user-service"`.
2. Abre una pestaña nueva con **+**. Elige **GET** y pega `http://localhost:8000/health` en la URL. Pulsa **Send**. Espera `200` y `"service": "stego"`. Deja esa pestaña abierta. Es una comprobación técnica y se hace fuera de las dos solicitudes de STEGO de la colección.
3. **PowerShell.** Pega `node scripts/compose.cjs stop stego` y pulsa **Enter**.
4. **Postman.** Repite **Health** de AUTH. Debe seguir en `200`. La pestaña de salud de STEGO no podrá conectarse mientras su contenedor esté detenido.
5. **PowerShell.** Pega `node scripts/compose.cjs up -d --build --wait stego`. Regresa a la pestaña de salud de STEGO y confirma `200`.

**Qué decir.** «Cada servicio tiene su contenedor, su proceso y su API. Detuve STEGO y AUTH siguió respondiendo». En T08 comprobarás el otro sentido. El comando equivalente para desplegar solo AUTH es `node scripts/compose.cjs up -d --build --wait auth`. Ese comando arranca su PostgreSQL si hace falta.

## T02. Contraseña correcta e incorrecta

1. **Postman → AUTH → Login de prueba → Body.** Verás `amendoza` en `identifier` y `{{seed_password}}` en `password`. Pulsa **Send**.
2. Confirma `200`, `expiresIn: 900` y `user.roles` con `ANALYST`. La colección guardó `accessToken` en `analyst_token`. Guarda el `user.id` de `amendoza` en una nota local como **ID de amendoza**. Ese ID sí se puede mostrar.
3. Para la contraseña incorrecta, abre una solicitud nueva con **+** arriba. Cambia el método a **POST**, pega `https://localhost:3443/api/v1/auth/login` en la barra de URL y en **Body → raw → JSON** pega:

   ```json
   {
     "identifier": "amendoza",
     "password": "incorrecta-para-la-prueba"
   }
   ```

4. Pulsa **Send**. Espera `401`. Regresa a la pestaña de la colección para continuar.

**Qué decir.** «AUTH verifica la contraseña. Con las credenciales válidas devuelve un JWT con 900 segundos de vigencia».

## T03. Sin JWT, con JWT alterado y con JWT vencido

**Prepara el caso vencido antes de clase.** Ejecuta **Login de prueba** con `amendoza` al menos 16 minutos antes. En **Variables**, copia localmente ese JWT a una nueva fila `token_vencido`. Usa el mismo login para renovar `analyst_token` al empezar. El token vencido se usa tal cual, sin editar su contenido. Mantén los JWT fuera de las capturas.

1. Abre **STEGO → Analizar imagen**. Adjunta `original_control.png`. Desmarca la fila `Authorization` en **Headers** y envía. Espera `401`.
2. Marca de nuevo la fila y escribe `Bearer token-invalido`. Envía. Espera `401`. Para mostrar una firma alterada, copia localmente un JWT válido, cambia el primer carácter **después del segundo punto** por otra letra y pon esa copia tras `Bearer ` en la fila. Vuelve a enviar y espera `401`. Conserva intacta la variable `analyst_token`.
3. Cambia el valor de esa misma fila a `Bearer {{token_vencido}}`. Envía. Debe dar `401`.
4. Al terminar, restaura `Bearer {{analyst_token}}`. Si Postman no puede leer el archivo, puedes repetir estos rechazos con **Body → none**.

**Qué decir.** «La API rechaza la operación si falta el token, se alteró o caducó».

## T04. Usuario autenticado sin permiso

1. Abre **AUTH → Login de prueba → Body**. Pon `"identifier": "mgomez"` y deja `"password": "{{seed_password}}"`. Pulsa **Send**. El `200` guarda el JWT en `user_token`.
2. Abre **STEGO → Analizar imagen → Headers**. Pon `Bearer {{user_token}}` en la fila `Authorization`. Adjunta `original_control.png` o usa **Body → none** para comprobar solo el permiso.
3. Pulsa **Send**. Debe devolver `403`. Después restaura `Bearer {{analyst_token}}`.

**Qué decir.** «El JWT identifica a mgomez, pero USER carece del permiso de análisis».

## T05. Crear cuentas y mostrar la relación de muchos a muchos

### Consigue el token de administración y los dos ID de rol

1. Abre **AUTH → Login ADMIN → Send**. Debe dar `200`. Se guarda el JWT de `jperez` en `access_token`. Las solicitudes administrativas ya llevan ese token.
2. Abre **Listar roles → Send**. En la respuesta, busca el elemento con `"rol": "USER"` y apunta el valor de su `id` como **ID de USER**. Haz lo mismo con `"rol": "ANALYST"` y guárdalo como **ID de ANALYST**.

### Crea dos usuarios para asignar el mismo rol durante el ensayo

1. Abre **Crear usuario → Body → raw → JSON**. Reemplaza el ejemplo por este y pulsa **Send**:

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

2. Debe dar `201`. Copia el `id` de la respuesta y apúntalo como **ID de la cuenta A**. La contraseña se obtiene de la variable que configuraste en la preparación.
3. En el mismo JSON, cambia `cedula` por `1799999002`, `username` por `demoparcialdos`, `email` por `demoparcialdos@example.com` y `telefono` por `0990009002`. Pulsa **Send**. Copia el nuevo `id` y apúntalo como **ID de la cuenta B**. Si repites el ensayo y recibes `409`, usa cédula, teléfono, correo y nombre de usuario distintos para las cuentas nuevas.

### Haz tres asignaciones y compruébalas

1. Ve a **colección → Variables**. En `user_id` pega el **ID de A** y en `role_id` el **ID de USER**. Abre **AUTH → Asignar rol → Send**. Espera `201`.
2. Conserva `user_id` de A. Cambia `role_id` al **ID de ANALYST**. Repite **Asignar rol**. Espera `201`.
3. Conserva `role_id` de ANALYST. Cambia `user_id` al **ID de B**. Repite **Asignar rol**. Espera `201`.
4. Con `user_id` de B, abre **Consultar asignaciones → Send**. Encuentra el `roleId` de ANALYST.
5. Cambia `user_id` a A y repite **Consultar asignaciones**. Debes ver dos filas, una para USER y otra con el **mismo `roleId` de ANALYST** que viste en B.
6. Si deseas iniciar sesión con la cuenta A, usa **Login de prueba**. Pon su nombre en `identifier` y `{{new_user_password}}` en `password`. El JWT se guarda en `demo_token`. Para los demás escenarios, vuelve a usar `amendoza` y `{{seed_password}}`.

**Qué decir.** «A tiene dos roles. ANALYST aparece en A y B con el mismo ID. Las asignaciones se consultan desde la API después de guardarlas».

## T06. Intentar duplicar una asignación

1. Pon `user_id` de A y `role_id` de ANALYST en **Variables**.
2. Abre **Asignar rol → Send** otra vez. Espera `409`.
3. Abre **Consultar asignaciones → Send**. Comprueba que A sigue teniendo dos filas y ANALYST aparece una sola vez.

## T07. Retirar el rol con el mismo JWT

1. Ejecuta **Login de prueba** con `amendoza` y `{{seed_password}}`. Abre **Analizar imagen** y revisa que **Headers** tenga `Bearer {{analyst_token}}`. Adjunta `original_control.png` y pulsa **Send**. Confirma `200`.
2. En **Variables**, pon en `user_id` el **ID de amendoza** del login. Abre **AUTH → Consultar asignaciones → Send**. Si la consulta da `401`, renueva solo **Login ADMIN**. El token de ADMIN es independiente del de ANALYST.
3. Encuentra la fila cuyo `roleId` coincide con el **ID de ANALYST**. Copia el campo **`id` de esa fila** y pégalo en `assignment_id`. Esa fila tiene su propio ID, aparte de `userId` y `roleId`.
4. Abre **Retirar asignación por id → Send**. Espera `204` y un cuerpo vacío.
5. Vuelve a **Analizar imagen** y pulsa **Send** con el mismo PNG y el mismo `{{analyst_token}}` del paso 1. Debe dar `403`. No vuelvas a iniciar sesión como `amendoza` entre los pasos 1 y 5.
6. Restaura el permiso antes de seguir. Pon `user_id` de amendoza y `role_id` de ANALYST. Pulsa **Asignar rol → Send**. Espera `201`. Vuelve a **Analizar imagen** y confirma `200` mientras el JWT siga vigente.

**Qué decir.** «Volví a enviar el mismo JWT. El resultado pasó de 200 a 403 porque AUTH volvió a leer las asignaciones de la base».

## T08. Dejar AUTH inaccesible

1. Confirma que restauraste ANALYST y que tienes un JWT fresco. En **Analizar imagen**, prueba un `200` antes de detener nada.
2. **PowerShell.** Ejecuta `node scripts/compose.cjs stop auth`.
3. **Postman.** Vuelve a la pestaña **GET http://localhost:8000/health** del T01. Debe seguir en `200`. Luego abre **Analizar imagen** y pulsa **Send** con el mismo PNG y el JWT de ANALYST vigente.
4. Espera `503`. El cuerpo no debe traer `analysis_id`. En **Headers de la respuesta**, busca `X-Request-Id` y apúntalo como **ID de la caída** para T12.
5. **PowerShell.** Ejecuta `node scripts/compose.cjs start auth --wait`. Si el comando termina, vuelve a Postman y comprueba **Health** de AUTH. Ya puedes repetir **Analizar imagen** para recuperar un `200`.

**Qué decir.** «STEGO sigue vivo y responde a su propia API. Para analizar necesita una autorización verificable y, si AUTH no responde, deniega el análisis».

## T09. Analizar la imagen de referencia y la imagen con carga

1. Abre **Analizar imagen → Body → form-data**. Selecciona `original_control.png` en `file`. Pulsa **Send** y busca `status: sin_indicios`.
2. Quita el archivo de la misma fila, elige `oculta_lsb.png` y pulsa **Send**. Busca `200`, `status: sospechoso` y `action: cuarentena`.
3. Anota el `analysis_id` del segundo resultado y su `X-Request-Id` en **Headers de la respuesta**. Postman ya actualizó la variable `analysis_id`. Usarás ese ID para T11 y el de solicitud para T12.
4. Muestra `sha256`, `technique`, `indicators` y `limitations`. Usa la explicación del [anexo C](#anexo-c-el-resultado-del-análisis).
5. Para probar también el permiso de **ADMIN**, ejecuta **Login ADMIN** y usa `Bearer {{access_token}}` en **Analizar imagen**. Con el mismo PNG debe dar `200`. Esa llamada actualizará `analysis_id`. Conserva aparte el ID del análisis de `amendoza` para T11 y restaura el encabezado de ANALYST.

El control es una imagen sintética con valores pares. La muestra LSB contiene texto real insertado en los bits bajos y relleno de carga alta. El generador comprueba que se puede recuperar el texto. El detector mide el balance estadístico. La muestra de ruido da un falso positivo y la de carga pequeña un falso negativo. [Generador](../ms-stego/scripts/generate_samples.py) · [Muestras y resultados](pruebas/resultados/stego-analisis-muestras.json)

## T10. Archivo inválido, corrupto y excesivo

1. **PowerShell.** Desde `App`, pega el bloque completo. Pulsa **Enter**. La última línea muestra una carpeta temporal con tres archivos.

   ```powershell
   $carpeta = Join-Path $env:TEMP ("stego-t10-" + [guid]::NewGuid())
   New-Item -ItemType Directory -Path $carpeta | Out-Null
   $png = (Resolve-Path 'docs/pruebas/muestras/original_control.png').Path
   $bytes = [IO.File]::ReadAllBytes($png)
   Copy-Item -LiteralPath $png -Destination (Join-Path $carpeta 'extension-invalida.jpg')
   [IO.File]::WriteAllBytes((Join-Path $carpeta 'truncado.png'), [byte[]]($bytes[0..39]))
   [IO.File]::WriteAllBytes((Join-Path $carpeta 'excesivo.png'), [byte[]]::new(5242881))
   $carpeta
   ```

2. **Postman.** En **Settings → General → Working directory**, elige temporalmente esa carpeta. Asegúrate de que el JWT de ANALYST siga vigente. En **Analizar imagen → Body → form-data**, selecciona y envía **un archivo cada vez**.

   | Archivo | Código esperado | Por qué |
   |---|---:|---|
   | `extension-invalida.jpg` | `415` | La extensión o el tipo enviado es incompatible con la API de PNG. |
   | `truncado.png` | `400` | Conserva el inicio de un PNG y faltan los datos para decodificarlo. Puede quedar un registro con estado `error`. |
   | `excesivo.png` | `413` | Tiene un byte más que el límite predeterminado de 5 MiB. |

3. Mira el **código HTTP de la respuesta** y el campo `detail`. Vuelve a poner `App/docs/pruebas/muestras` como carpeta de trabajo al terminar.

## T11. Consultar un resultado propio y otro ajeno

1. En **Variables** pega en `analysis_id` el ID del resultado de `amendoza` que anotaste en T09. Usa ese mismo ID durante los pasos siguientes.
2. Abre **Consultar resultado → Headers**. Pon `Bearer {{analyst_token}}` y pulsa **Send**. Como propietario, debe dar `200`. Esta solicitud no lleva archivo.
3. Ejecuta **Login de prueba** con `cvega` y `{{seed_password}}`. Se guarda su JWT en `other_analyst_token`. Vuelve a **Consultar resultado** y cambia solo el valor del encabezado a `Bearer {{other_analyst_token}}`. Pulsa **Send**. Debe dar `403`.
4. Ejecuta **Login ADMIN** si su sesión caducó. Vuelve a **Consultar resultado** y pon `Bearer {{access_token}}`. El mismo ID debe dar `200`. Al terminar, deja de nuevo el encabezado de ANALYST.

**Qué decir.** «Los dos analistas pueden analizar. Para consultar un resultado, además se verifica el propietario. ADMIN puede consultar resultados ajenos».

## T12. Revisar la auditoría sin mostrar secretos

1. **Postman.** Ten a mano el **ID de la caída** de T08 y el `X-Request-Id` del análisis de T09. Puedes buscarlos en **Headers** de cada respuesta. Si se han perdido entre muchas solicitudes, repite esas dos pruebas.
2. **PowerShell.** Desde `App`, pega esta línea y pulsa **Enter**. Es una consulta de lectura a las últimas 30 filas de STEGO.

   ```powershell
   node scripts/compose.cjs exec -T stego python -c "import sqlite3; db=sqlite3.connect('/data/stego.sqlite3'); print(*db.execute('SELECT request_id, route, status_code, analysis_id FROM audit_events ORDER BY id DESC LIMIT 30'), sep=chr(10))"
   ```

3. Busca la fila del análisis `200` con un `analysis_id` y la fila de la caída `503` sin `analysis_id`. En la salida de Python, `None` representa un dato vacío. Señala cómo el `request_id` de cada fila coincide con el encabezado que viste en Postman.
4. Para mostrar también AUTH en vivo, abre el `.env` local de AUTH y lee solo los valores de `DB_USERNAME` y `DB_DATABASE`. Reemplaza `USUARIO_DB` y `NOMBRE_DB` en la línea de abajo por esos dos nombres. Ejecuta la línea desde `App`. Busca el `request_id` del análisis exitoso y las decisiones de STEGO.

   ```powershell
   node scripts/compose.cjs exec -T postgres psql -U USUARIO_DB -d NOMBRE_DB -c "SELECT request_id, service_id, action, status_code, allowed FROM auth_audit_events ORDER BY occurred_at DESC LIMIT 30"
   ```

**Qué decir.** «Podemos seguir una solicitud por su identificador y ver la acción y el estado. Las bitácoras muestran los campos de auditoría sin incluir contraseñas, claves ni JWT completos». [Ejemplo depurado de AUTH](pruebas/resultados/auth-auditoria-ejemplo.json) · [Ejemplo de STEGO](pruebas/resultados/stego-auditoria.json)

Al terminar el ensayo puedes detener el conjunto con `node scripts/compose.cjs down`. Ese comando conserva los datos de los volúmenes.

## Anexo B. La decisión interna

1. Haz clic en **Login de prueba**, deja `amendoza` en el cuerpo y envía. Postman habla con AUTH en `https://localhost:3443/api/v1/auth/login` y guarda el JWT.
2. Haz clic en **Analizar imagen** y envía el PNG. Postman llama a STEGO en `http://localhost:8000/api/v1/steganography/analyze` con el JWT en **Headers → Authorization**.
3. STEGO verifica la firma y vigencia del JWT. Luego llama a **AUTH** desde su red interna por HTTPS. La ruta exacta es `POST /internal/authorization/check`. El encabezado `X-Service-Token` identifica a STEGO como servicio y la CA permite verificar el certificado de AUTH.
4. STEGO envía `subject_token` (JWT del usuario), `action: "steganography.analyze"` y `resource_id: null` porque todavía no hay análisis. AUTH valida el estado del usuario y lee sus asignaciones vigentes. Devuelve `subject_id`, `action`, `resource_id`, `allowed` y `reason`.
5. Una respuesta interna `200` puede incluir `allowed: false`. En ese caso el cliente recibe `403` de STEGO. Cuando AUTH está caído, STEGO devuelve `503`. Si la respuesta interna no se puede verificar, STEGO puede devolver `502`. En todos esos casos se deniega el análisis.
6. En una consulta de resultado, la acción es `steganography.results.read`. STEGO envía el ID del análisis y el propietario leído de SQLite. Cada petición pide una decisión nueva. Esto explica por qué T07 funciona con el mismo JWT.

En la demo, muestra la llamada interna con la auditoría de T12. Cuando **Analizar imagen** devuelve `200`, usa el mismo `X-Request-Id` en los registros de AUTH y STEGO. En AUTH aparece la acción `steganography.analyze` y la decisión. En STEGO aparece el análisis que se creó. La credencial de servicio se usa internamente. [Contrato OpenAPI de AUTH](contratos/openapi-auth.json)

## Anexo C. El resultado del análisis

Abre **Analizar imagen**, adjunta `oculta_lsb.png` y pulsa **Send**. Lee el JSON de la respuesta **de abajo**, no el cuerpo de la solicitud de arriba.

| Campo | Qué puedes decir |
|---|---|
| `analysis_id` | «Es el identificador del análisis. Con él consulto el resultado después». |
| `user_id` | «Es el UUID de quien solicitó el análisis. AUTH lo usa para evaluar quién puede consultar este resultado». |
| `filename`, `sha256` | «Son el nombre recibido y la huella de los bytes de este archivo». |
| `technique`, `indicators` | «Aquí está el método y los números que calculó sobre los píxeles». |
| `created_at`, `status`, `action`, `limitations` | «Aquí consta cuándo ocurrió, cómo se clasificó, qué política aplicó y qué limitaciones tiene el resultado». |

En las muestras guardadas, la de carga alta tiene `chi_square ≈ 125.30` y `equiprobability_p_value ≈ 0.5511`. Con la regla del proyecto, ese patrón de pares balanceados se marca `sospechoso` y se guarda en cuarentena. El número mide compatibilidad con ese patrón estadístico. No es una probabilidad de que la imagen contenga un mensaje. El `0.82` del PDF es un ejemplo de estructura. Para la demo usa los valores que veas en tu respuesta. [Método](02_seguridad_contratos_y_metodo.md#método-de-análisis-esteganográfico) · [Contrato OpenAPI de STEGO](contratos/openapi-stego.json)

## Para qué sirve cada solicitud

Un **endpoint** es una combinación de método y ruta, como `POST /api/v1/auth/login`. Una **solicitud guardada** de Postman puede usar ese mismo endpoint con otra cuenta, otro archivo o un token distinto. Por ejemplo, **Login ADMIN** y **Login de prueba** llaman a la misma ruta. Al lado de cada nombre, `GET` suele leer, `POST` envía datos o realiza una acción, `PATCH` cambia campos y `DELETE` retira un recurso o asignación.

### Carpeta AUTH

En esta tabla, las rutas abreviadas que empiezan con `/auth`, `/users`, `/roles` o `/user-roles` van después de `https://localhost:3443/api/v1`. La ruta interna va directamente después de `https://localhost:3443`.

| Solicitud | Método y ruta | Qué hace y qué usa |
|---|---|---|
| Health | `GET /health` | Comprueba que AUTH responde. Es pública y no requiere token. |
| Login ADMIN | `POST /auth/login` | Entra como `jperez` con `seed_password`. Guarda el JWT en `access_token` para administrar. |
| Login de prueba | `POST /auth/login` | Cambia la cuenta en **Body**. Guarda el JWT en la variable correspondiente a esa cuenta. |
| Perfil | `GET /auth/profile` | Devuelve la identidad y roles de la sesión del token enviado. Esta copia usa `access_token`. |
| Perfil alias me | `GET /auth/me` | Consulta el mismo perfil desde la ruta alternativa. |
| Crear usuario | `POST /users` | Como ADMIN, crea una cuenta con el JSON de **Body**. Devuelve `201` y el ID del usuario. |
| Listar usuarios | `GET /users` | Como ADMIN, lista usuarios en páginas. Busca los elementos en `data`. |
| Consultar usuario | `GET /users/{id}` | Como ADMIN, busca un usuario específico. El ID sale de `user_id`. |
| Consultar cédula | `GET /users/cedula/{cedula}` | Como ADMIN, busca por cédula. Cambia los últimos diez dígitos de la URL por la cédula de la cuenta de prueba. |
| Actualizar usuario | `PATCH /users/{id}` | Como ADMIN, modifica los campos enviados en **Body** para `user_id`. El ejemplo cambia `nombres`. |
| Eliminar usuario | `DELETE /users/{id}` | Como ADMIN, hace un borrado lógico de `user_id` y devuelve `204`. Si lo ensayas, usa una cuenta de prueba. |
| Crear rol | `POST /roles` | Como ADMIN, crea un rol de catálogo. El ejemplo usa `SUPERVISOR`. Los permisos de análisis actuales corresponden a ADMIN o ANALYST. |
| Listar roles | `GET /roles` | Como ADMIN, lista los roles y permite copiar sus ID. El nombre del rol aparece en `rol`. |
| Consultar rol | `GET /roles/{id}` | Como ADMIN, muestra el detalle del rol guardado en `role_id`. |
| Actualizar rol | `PATCH /roles/{id}` | Como ADMIN, cambia campos de `role_id`. El ejemplo modifica la descripción. |
| Eliminar rol | `DELETE /roles/{id}` | Como ADMIN, hace un borrado lógico del rol y devuelve `204`. Si lo ensayas, usa el rol de prueba. |
| Asignar rol | `POST /user-roles` | Como ADMIN, une `user_id` con `role_id`. Devuelve la fila creada con un ID de asignación. |
| Consultar asignaciones | `GET /user-roles/user/{userId}` | Como ADMIN, muestra las asignaciones de `user_id` con sus ID y rol asociado. |
| Retirar asignación por id | `DELETE /user-roles/{id}` | Como ADMIN, retira únicamente la fila `assignment_id`. Se usa en T07. |
| Logout | `POST /auth/logout` | Usa el token de `access_token`, devuelve `204` e invalida los JWT emitidos anteriormente para esa cuenta. Déjalo para el final si todavía necesitas el token de ADMIN. |

### Carpeta STEGO

Estas son las dos solicitudes de negocio. Cada una se reutiliza cambiando el JWT, el archivo o el ID.

| Solicitud | Método y ruta | Qué hace y qué usa |
|---|---|---|
| Analizar imagen | `POST /api/v1/steganography/analyze` | Envía `file` y el JWT de ANALYST o ADMIN. Con `200` guarda `analysis_id`. Reutiliza esta solicitud para los rechazos. |
| Consultar resultado | `GET /api/v1/steganography/results/{analysis_id}` | Devuelve el análisis al propietario con permiso o a ADMIN. Puedes probar un análisis ajeno cambiando solo el token. |

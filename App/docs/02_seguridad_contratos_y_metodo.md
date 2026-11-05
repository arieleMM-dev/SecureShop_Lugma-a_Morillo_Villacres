# JWT, RBAC, contratos y método esteganográfico

## Flujo de decisión

1. AUTH verifica credenciales con Argon2id y emite JWT RS256 de vigencia acotada. La privada RSA permanece en AUTH.
2. STEGO verifica localmente firma RS256, emisor, audiencia, expiración, tipo de acceso, identificador UUID, versión y duración del token. No usa roles enviados por el cliente.
3. Antes de leer el cuerpo multipart, STEGO consulta `POST https://auth:3443/internal/authorization/check`, enviando JWT y acción, con `X-Service-Token`. El certificado se verifica con la CA y TLS mínimo 1.3.
4. AUTH vuelve a comprobar sesión, usuario, roles y asignaciones activos desde PostgreSQL. Para lectura, STEGO aporta el propietario obtenido de su SQLite, nunca del cliente.
5. STEGO exige que la respuesta coincida en sujeto, acción y recurso y que `allowed` sea un booleano real. No almacena decisiones como permisos permanentes. Denegación → 403; JWT/sesión inválidos → 401; indisponibilidad de AUTH → 503; decisión mal formada → 502. No procesa el archivo sin permiso comprobado.
6. Una vez autorizado, valida el archivo, ejecuta el trabajador aislado y conserva métricas reales, SHA-256, propietario, fecha y política. La consulta posterior repite la autorización por recurso.

El endpoint interno requiere TLS real y la identidad de servicio; un JWT del usuario por sí solo no lo habilita. La credencial compartida identifica al servicio; no se presenta como mTLS. El cliente STEGO valida el certificado servidor y no sigue redirecciones. La ventana entre la decisión y la operación no desaparece: la revocación se hace efectiva en la siguiente decisión, sin prometer cancelar trabajos ya autorizados.

## Claves y vigencia de JWT

AUTH firma con RS256 y un par RSA de al menos 3072 bits. El plazo inicial es 900 segundos y se configura con `JWT_EXPIRES_IN_SECONDS`. La firma vincula `sub` con el UUID del usuario e incluye `iss`, `aud`, `iat`, `exp`, `typ` y `tokenVersion`. Los roles que devuelve el login se consultan para informar al cliente. El permiso se decide de nuevo con los datos persistidos.

El [inicializador](../scripts/init-env.cjs) mantiene el material local fuera de Git y distribuye a STEGO la clave pública, la CA y su credencial de servicio. La privada de firma y la clave privada del certificado TLS permanecen en AUTH. Al rotar el par de firma, actualizar la pública que usa STEGO, reiniciar ambos servicios y emitir JWT nuevos. [Configuración de AUTH](../ms-users/src/config/env.schema.ts), [módulo JWT](../ms-users/src/auth/auth.module.ts) y [verificación en STEGO](../ms-stego/app/security.py).

## Matriz de permisos

| Operación | ADMIN | ANALYST | USER |
|---|---|---|---|
| Login con credenciales válidas | Sí | Sí | Sí |
| Perfil y logout propios | Sí | Sí | Sí |
| CRUD de usuarios y roles; asignar/retirar roles | Sí | No | No |
| Analizar un PNG | Sí | Sí | No |
| Consultar resultados propios | Sí | Sí | No |
| Consultar resultados ajenos | Sí | No | No |
| Endpoint interno de decisiones | Solo cliente de servicio autenticado; vuelve a evaluar al usuario | Igual | Igual |

La acumulación de roles aplica los permisos efectivos actuales, sin elevar a USER por enviar cabeceras falsas. Un ANALYST que pierde su asignación deja de poder analizar con el mismo JWT. El logout incrementa la versión de tokens del usuario; este mecanismo invalida sus tokens previos, no solamente un token individual.

## Límites operativos

Los puertos de desarrollo se restringen a loopback. El canal interno usa HTTPS; STEGO expone HTTP local, por lo que el despliegue remoto requiere TLS de entrada. La red de servicios permite salida para operar; el trabajador de imágenes tiene las llamadas de red denegadas con seccomp. El contenedor no es privilegiado, no tiene capacidades y usa sistema raíz de solo lectura. El trabajador comparte el UID y el volumen de STEGO: este aislamiento limita recursos y red, pero no constituye una frontera completa frente a una vulnerabilidad que permita leer archivos del propio servicio. Mantener dependencias actualizadas y evaluar un aislamiento de filesystem más estricto para producción.

Cada instancia STEGO está limitada a dos trabajos; SQLite y el volumen local corresponden a esta entrega de una sola instancia. Las credenciales y certificados necesitan gestión y rotación; no se incluye una plataforma de secretos ni alta disponibilidad.

## Contratos OpenAPI

| Servicio | Contrato entregable | Swagger local | Rutas |
|---|---|---|---|
| AUTH | [OpenAPI AUTH](contratos/openapi-auth.json) | `https://localhost:3443/docs` | REST bajo `/api/v1`; la decisión interna queda en `/internal/authorization/check` |
| STEGO | [OpenAPI STEGO](contratos/openapi-stego.json) | `http://localhost:8000/docs` | `/health` y operaciones bajo `/api/v1/steganography` |

Los JSON son los contratos completos, importables por separado. En AUTH, `page` y `limit` son opcionales, con valores iniciales 1 y 20. Los esquemas documentan resultados, páginas, asignaciones y el formato del filtro global de errores. STEGO documenta el cuerpo multipart y los errores, incluida la respuesta con `analysis_id` cuando se registra un análisis fallido. En una operación protegida, 401 indica que no se autenticó la solicitud, 403 que la sesión carece de permiso, 502 que la decisión de AUTH no se pudo verificar y 503 que el servicio no pudo completar la autorización o el procesamiento.

Regeneración desde `App/ms-users` con `npm run docs:openapi`. Desde `App/ms-stego`, con el entorno Python de pruebas activo, ejecutar `python -m scripts.export_openapi`. Ambas herramientas escriben en `App/docs/contratos`.

## Método de análisis esteganográfico

### Alcance y fundamento

Se selecciona PNG de 8 bits en escala de grises, RGB o RGBA (alfa excluido). No se admiten PNG indexados, de 16 bits, animados ni JPEG/BMP. Cumple la alternativa PNG del enunciado. La técnica busca equiprobabilidad entre valores adyacentes `2j` y `2j+1`, un efecto compatible con reemplazar sus bits menos significativos con una carga de bits aproximadamente balanceados.

El análisis de pares de valores se inspira en [Westfeld y Pfitzmann, Attacks on Steganographic Systems](https://users.ece.cmu.edu/~adrian/487-s06/westfeld-pfitzmann-ihw99.pdf). Esta implementación usa un **contraste Pearson condicional con ambas categorías por pareja**; no reproduce exactamente la fórmula y los grados de libertad de aquel detector. La identificación de técnica es `pov_pearson_lsb_png8_v1`; versión de cálculo `pov-pearson-v1`.

### Cálculo implementado

1. Validar extensión `.png`, MIME `image/png`, firma PNG e IHDR. Comprobar tamaño, profundidad, canales y dimensiones antes de decodificar. Pillow verifica estructura e integridad y vuelve a abrir para cargar píxeles.
2. Extraer muestras de intensidad de los canales admitidos. Construir el histograma `h[0..255]`.
3. Para cada pareja `j`, definir `e_j = h[2j]`, `o_j = h[2j+1]`, `n_j = e_j + o_j`. Incluir solo parejas con `n_j ≥ 10`: bajo la hipótesis de equiprobabilidad, cada frecuencia esperada es `n_j/2 ≥ 5`.
4. Exigir al menos 8192 muestras de canal y 64 parejas elegibles. Si falta evidencia, devolver `no_concluyente`, sin inventar un p-valor.
5. Bajo `H0: P(par | pareja) = P(impar | pareja) = 1/2`, calcular:

```text
X² = Σ [ (e_j - n_j/2)²/(n_j/2) + (o_j - n_j/2)²/(n_j/2) ]
   = Σ (e_j - o_j)²/n_j
k  = número de parejas elegibles
gl = k
p  = P(Chi-cuadrado(gl) ≥ X²) = scipy.stats.chi2.sf(X², k)
```

Cada pareja tiene un total condicionado y dos categorías: aporta un grado de libertad. No se ajusta una probabilidad libre desde los datos; la proporción 1/2 se fija en H0. Se usa la [función de supervivencia chi2 de SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.chi2.html). La aproximación supone muestras suficientemente independientes; la correlación espacial real limita su interpretación.

6. Clasificar mediante parámetros propios, explícitos y no impuestos por el PDF:

| Condición | Estado | Justificación |
|---|---|---|
| Muestra/parejas insuficientes | `no_concluyente` | La aproximación no tiene el soporte mínimo adoptado |
| `p ≥ 0,05` | `sospechoso` | Los datos son compatibles con equiprobabilidad; indicio heurístico |
| `p < 0,01` | `sin_indicios` | Se rechaza fuertemente esa hipótesis concreta; no demuestra ausencia de mensajes |
| `0,01 ≤ p < 0,05` | `no_concluyente` | Zona intermedia conservadora |
| Decodificación, aislamiento o procesamiento fallidos | `error` | No se obtuvo un análisis válido |

Los valores 0,05/0,01 son umbrales iniciales de decisión, no umbrales calibrados sobre un corpus representativo. Los mínimos 8192/64/10 buscan evitar conclusiones con pocos datos, sin garantizar independencia ni precisión. **Un p-valor alto no es la probabilidad de que exista esteganografía** y no aceptar/rechazar H0 equivale a demostrar un mensaje.

Además se informa `lsb_one_fraction`, la fracción observada de bits bajos en uno; no determina por sí sola el estado. Todos los indicadores salen de los píxeles, no del nombre de archivo, hash, encabezado del mensaje o una etiqueta prefijada. El detector no conoce el formato de carga usado por el generador de pruebas.

### Construcción y resultados de muestras

[`generate_samples.py`](../ms-stego/scripts/generate_samples.py) crea un control sintético de 256 × 256 RGB con intensidades pares. Para `oculta_lsb.png` inserta realmente un encabezado `STEGOv1!`, longitud y mensaje UTF-8, completando capacidad con bits pseudoaleatorios de semilla fija 4201. Recupera los bits y comprueba el mensaje por aserción. Otra muestra inserta solo el encabezado y mensaje, sin llenar la capacidad; una tercera usa ruido benigno independiente con semilla 4202 y sin mensaje. La pequeña es 8 × 8.

| Archivo | Verdad de construcción | Resultado calculado | Interpretación |
|---|---|---|---|
| `original_control.png` | Sin carga | `sin_indicios` | Control negativo sintético |
| `oculta_lsb.png` | Carga LSB de alta ocupación | `sospechoso` | Verdadero positivo del caso compatible |
| `oculta_baja_carga.png` | Mensaje LSB de baja ocupación | `sin_indicios` | Falso negativo: limitación real |
| `ruido_sin_mensaje.png` | Ruido sin mensaje | `sospechoso` | Falso positivo: equiprobabilidad benigna |
| `pequena.png` | Sin carga | `no_concluyente` | Evidencia insuficiente |

El [manifiesto](pruebas/muestras/manifest.json) contiene hashes e indicadores reproducibles. La [ejecución por API con contenedores reales](pruebas/resultados/stego-analisis-muestras.json) comprueba las cinco muestras, incluyendo aislamiento Linux. Entre las cuatro muestras concluyentes hay TP=1, FP=1, TN=1 y FN=1; una adicional es no concluyente. Son ejemplos construidos para mostrar comportamiento, no un corpus independiente ni una estimación de precisión general. No se afirma TPR ≥ 90 %, FPR ≤ 5 % ni las latencias de documentos de actividades anteriores.

### Política, límites y controles

`sin_indicios` → advertencia y eliminación del archivo; demás estados → cuarentena privada durante siete días. Los errores previos a admitir el PNG se rechazan sin análisis. La cuarentena es una medida preventiva, no un dictamen de contenido ilícito. Se conserva SHA-256 y metadatos del análisis.

La baja carga puede evadir el contraste. Ruido benigno, cifrado previo de píxeles u otras distribuciones balanceadas pueden producir falsos positivos. No identifica mensajes específicos, LSB matching, esteganografía adaptativa, contenido oculto solo en metadatos, JPEG ni todas las variantes de PNG. Las relaciones espaciales y el tratamiento conjunto de canales también limitan el modelo. El detector es una técnica verificable de alcance acotado, no una herramienta forense concluyente.

El PNG se trata como entrada hostil: validación, límites de píxeles, proceso separado, CPU/memoria/tiempo, entorno sin credenciales y seccomp sin red. Se consideran las recomendaciones de seguridad y descompresión de [Pillow](https://pillow.readthedocs.io/en/stable/handbook/security.html). Esto reduce riesgos, sin prometer protección completa frente a fallos de las bibliotecas de decodificación.

# Método de análisis estadístico LSB

## Alcance y fundamento

Se selecciona PNG de 8 bits en escala de grises, RGB o RGBA (alfa excluido). No se admiten PNG indexados, de 16 bits, animados ni JPEG/BMP. Cumple la alternativa PNG del enunciado. La técnica busca equiprobabilidad entre valores adyacentes `2j` y `2j+1`, un efecto compatible con reemplazar sus bits menos significativos con una carga de bits aproximadamente balanceados.

El análisis de pares de valores se inspira en [Westfeld y Pfitzmann, Attacks on Steganographic Systems](https://users.ece.cmu.edu/~adrian/487-s06/westfeld-pfitzmann-ihw99.pdf). Esta implementación usa un **contraste Pearson condicional con ambas categorías por pareja**; no reproduce exactamente la fórmula y los grados de libertad de aquel detector. La identificación de técnica es `pov_pearson_lsb_png8_v1`; versión de cálculo `pov-pearson-v1`.

## Cálculo implementado

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

## Construcción y resultados de muestras

`scripts/generate_samples.py` crea un control sintético de 256 × 256 RGB con intensidades pares. Para `oculta_lsb.png` inserta realmente un encabezado `STEGOv1!`, longitud y mensaje UTF-8, completando capacidad con bits pseudoaleatorios de semilla fija 4201. Recupera los bits y comprueba el mensaje por aserción. Otra muestra inserta solo el encabezado y mensaje, sin llenar la capacidad; una tercera usa ruido benigno independiente con semilla 4202 y sin mensaje. La pequeña es 8 × 8.

| Archivo | Verdad de construcción | Resultado calculado | Interpretación |
|---|---|---|---|
| `original_control.png` | Sin carga | `sin_indicios` | Control negativo sintético |
| `oculta_lsb.png` | Carga LSB de alta ocupación | `sospechoso` | Verdadero positivo del caso compatible |
| `oculta_baja_carga.png` | Mensaje LSB de baja ocupación | `sin_indicios` | Falso negativo: limitación real |
| `ruido_sin_mensaje.png` | Ruido sin mensaje | `sospechoso` | Falso positivo: equiprobabilidad benigna |
| `pequena.png` | Sin carga | `no_concluyente` | Evidencia insuficiente |

El [manifiesto](../samples/manifest.json) contiene hashes e indicadores reproducibles. La [ejecución por API con contenedores reales](resultados-ejecucion.json) comprueba las cinco muestras, incluyendo aislamiento Linux. Entre las cuatro muestras concluyentes hay TP=1, FP=1, TN=1 y FN=1; una adicional es no concluyente. Son ejemplos construidos para mostrar comportamiento, no un corpus independiente ni una estimación de precisión general. No se afirma TPR ≥ 90 %, FPR ≤ 5 % ni las latencias de documentos de actividades anteriores.

## Política, límites y controles

`sin_indicios` → advertencia y eliminación del archivo; demás estados → cuarentena privada durante siete días. Los errores previos a admitir el PNG se rechazan sin análisis. La cuarentena es una medida preventiva, no un dictamen de contenido ilícito. Se conserva SHA-256 y metadatos del análisis.

La baja carga puede evadir el contraste. Ruido benigno, cifrado previo de píxeles u otras distribuciones balanceadas pueden producir falsos positivos. No identifica mensajes específicos, LSB matching, esteganografía adaptativa, contenido oculto solo en metadatos, JPEG ni todas las variantes de PNG. Las relaciones espaciales y el tratamiento conjunto de canales también limitan el modelo. El detector es una técnica verificable de alcance acotado, no una herramienta forense concluyente.

El PNG se trata como entrada hostil: validación, límites de píxeles, proceso separado, CPU/memoria/tiempo, entorno sin credenciales y seccomp sin red. Se consideran las recomendaciones de seguridad y descompresión de [Pillow](https://pillow.readthedocs.io/en/stable/handbook/security.html). Esto reduce riesgos, sin prometer protección completa frente a fallos de las bibliotecas de decodificación.

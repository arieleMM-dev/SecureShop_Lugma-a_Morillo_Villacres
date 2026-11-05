# Entregables del Backend V1

La [guía de ejecución conjunta](../README.md) y los archivos que construyen o configuran las aplicaciones se conservan junto al código. Este índice reúne los documentos y evidencias de entrega.

| Documento | Contenido |
|---|---|
| [00 · Mapa de cumplimiento](00_mapa_cumplimiento.md) | Consigna 2.1–2.5 y 3, con rutas y comprobaciones concretas |
| [01 · Arquitectura y modelo de datos](01_arquitectura_y_modelo_datos.md) | Límites de confianza, comunicación, persistencias y modelo N:M, con dos imágenes SVG |
| [02 · Seguridad, contratos y método](02_seguridad_contratos_y_metodo.md) | JWT, RBAC, roles vigentes, matriz de permisos, OpenAPI y justificación del detector |
| [03 · Matriz de riesgos](03_matriz_riesgos.md) | Activos, amenazas, vulnerabilidades, riesgos, controles y principios de seguridad |
| [04 · Pruebas y evidencias](04_pruebas_y_evidencias.md) | Pruebas unitarias, funcionales, de seguridad y de integración, con comandos de reproducción |
| [05 · Guion de sustentación](05_guion_sustentacion_postman.md) | Preparación, solicitudes, datos, resultados esperados y recuperación tras revocación o caída |

Los archivos [OpenAPI AUTH](contratos/openapi-auth.json) y [OpenAPI STEGO](contratos/openapi-stego.json) se importan por separado. La [colección Postman](pruebas/backend-v1.postman_collection.json), las [muestras](pruebas/muestras/manifest.json) y los resultados quedan bajo `pruebas`. La colección simplificada contiene dos solicitudes de negocio para STEGO y sus pruebas se hacen cambiando los datos. En [histórico](historico/README.md) se conservan las referencias de fases previas y los cuatro checklists. Los README de [AUTH](../ms-users/README.md) y [STEGO](../ms-stego/README.md) documentan el arranque de cada servicio.

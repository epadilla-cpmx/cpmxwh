# Módulo de prospección comercial por WhatsApp

Primera versión: enviar un mensaje inicial a un máximo de 10 filas seleccionadas en Google Sheets, encolando cada envío en Cloud Tasks. El módulo comercial está separado del flujo de reclutamiento y reutiliza Evolution API, el servicio de envío existente y la normalización de teléfonos.

## Archivos nuevos

- `routes/commercial.js`: endpoints comerciales.
- `services/commercialProspecting.js`: validación, cola, envío y actualización de Sheets.
- `apps-script/commercial-prospecting.gs`: menú de Google Sheets para enviar las filas seleccionadas.

## Columnas

La pestaña de empresas conserva sus columnas A:G:

A Empresa · B estado · C contacto · D correo · E telefono · F seguimiento · G ultima respuesta

El backend agrega:
- H Fecha primer mensaje
- I Estado de envío
- J Error de envío

Estados principales: `EN COLA`, `ENVIANDO`, `ENVIADO`, `ERROR` y `PENDIENTE: FUERA DE HORARIO`.

## Variables de entorno de Cloud Run

Configurar con valores seguros en Cloud Run; no guardar secretos en Git:

- `COMMERCIAL_TASK_KEY`: secreto interno que autentica las solicitudes de Cloud Tasks al endpoint de envío.
- `COMMERCIAL_EVOLUTION_INSTANCE=Erick2`
- `COMMERCIAL_QUEUE=commercial-sender`
- `EVOLUTION_URL`
- `EVOLUTION_API_KEY`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CLOUD_PROJECT` (o `GCP_PROJECT`)
- `CLOUD_RUN_URL`
- `SENDER_QUEUE_LOCATION` (o `CLOUD_TASKS_LOCATION`)

El correo de servicio debe tener permiso de edición sobre la hoja y permiso para crear tareas en Cloud Tasks. También debe tener `roles/run.invoker` sobre el servicio Cloud Run, ya que las tareas usan OIDC.

## Preparación de Google Cloud

1. Habilitar Cloud Tasks API.
2. Crear la cola `commercial-sender` en la ubicación indicada por `SENDER_QUEUE_LOCATION`.
3. Confirmar que la cuenta de servicio de ejecución puede crear tareas y que la cuenta OIDC tiene `roles/run.invoker` sobre Cloud Run.
4. Desplegar el código después de configurar todas las variables.
5. Verificar que la instancia de Evolution se llame exactamente `Erick2` y esté conectada.

## Preparar Apps Script

1. Abrir la hoja de cálculo y entrar en Extensiones > Apps Script.
2. Copiar el contenido de `apps-script/commercial-prospecting.gs` al editor.
3. Guardar, volver a cargar la hoja y autorizar el script.
4. Seleccionar hasta 10 filas de datos y usar el menú **Aplicaciones > Mandar mensajes por WhatsApp**.

El script toma los datos de A (empresa), C (contacto) y E (teléfono), sin importar qué columnas se hayan seleccionado visualmente. Pide confirmación antes de enviar.

## Límites y comportamiento

- Solo permite iniciar lotes entre las 08:00 y las 20:00 de America/Monterrey, con margen estimado para terminar el lote.
- Programa mensajes separados por intervalos de 2 a 5 minutos. Configura la cola Cloud Tasks con máximo de despachos concurrentes igual a 1 para serializar los envíos.
- Solicita presencia `composing` y un delay de escritura aleatorio de 9 a 15 segundos mediante Evolution API; esto no garantiza evitar bloqueos.
- Usa el servicio `sendMessage` existente, que normaliza números y aplica el horario de envío.
- El endpoint de inicio comercial no requiere una API key personalizada, como la ruta de entrevistas. Las tareas internas requieren `x-commercial-task-key` y OIDC.
- El envío es para contactos seleccionados manualmente; confirmar que existe una base legítima para contactarlos y respetar inmediatamente cualquier solicitud de no recibir más mensajes.
- La versión inicial no interpreta respuestas, no programa seguimientos posteriores y no tiene un control global de pausa/reanudación. Esas funciones quedan para una fase posterior.
- Las tareas que lleguen fuera del horario se marcan como pendientes para reprogramación manual, no se reintentan automáticamente.

## Seguridad

El archivo `.env` fue retirado de las ramas de trabajo. Como estuvo publicado en el repositorio, las credenciales que contenía deben rotarse; borrarlo del último commit no elimina los valores del historial Git. Nunca guardar claves reales en archivos versionados.

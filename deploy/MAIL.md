# Correos de cuenta

Manualito envía correos para verificar una dirección de email y recuperar
el acceso a una cuenta. Los mensajes incluyen una versión HTML y otra de
texto plano, en español o inglés según el idioma elegido en la aplicación.

## Flujo de envío

El frontend incluye el idioma en las solicitudes de registro, reenvío de
verificación, recuperación de contraseña y cambio de email. La API prepara
el mensaje con el enlace correspondiente y lo encola en Celery. El worker
de correo realiza el envío por SMTP, fuera de la petición HTTP del usuario.

La verificación y la recuperación comparten una plantilla HTML. El asunto,
los textos y la acción cambian según el tipo de correo y el idioma. La URL
del enlace procede de `FRONTEND_PUBLIC_URL`.

## Entorno local y despliegue público

El mismo cliente SMTP sirve para ambos entornos. El destino depende de la
configuración de los servicios al arrancar.

El asistente `setup` pregunta por el servicio de correo después del modelo
y el OCR. Enter selecciona Mailpit y la opción 2 selecciona Resend. La
elección se guarda como `MANUALITO_MAIL_PROVIDER` en
`deploy/local/selected.env`. Los scripts `start` y `stop` reutilizan esa
configuración. El modo `--use-recommended` selecciona Mailpit.

| Configuración | Entorno local | Despliegue con Resend |
| --- | --- | --- |
| Servidor SMTP | `mailpit` | `smtp.resend.com` |
| Puerto | `1025` | `465` |
| Conexión | Sin TLS ni autenticación | TLS directo y clave de envío |
| Entrega | Captura local en Mailpit | Envío al destinatario |
| Remitente | `no-reply@manualito.local` | `Manualito <accounts@manualito.dev>` |

El Compose base utiliza Mailpit. El archivo adicional
[`compose/mail/resend.yaml`](compose/mail/resend.yaml) configura Resend para
la API y `celery-worker-mail`, establece `https://app.manualito.dev` como URL
pública y deja Mailpit en el perfil opcional `local-mail`.

Al seleccionar Resend, los scripts incluyen ese archivo al construir el
comando de Compose. La presencia del túnel de Cloudflare no modifica el
servicio de correo.

## Credenciales y entrega

La clave de Resend se almacena en `secrets/resend_api_key.txt`, excluido de
Git y del contexto de construcción de las imágenes. Compose lo monta en
la API y el worker como `/run/secrets/resend_api_key`. El backend lee esa
ruta mediante `SMTP_PASSWORD_FILE`.

El setup y el arranque comprueban que el archivo de la clave existe y no
está vacío cuando se selecciona Resend. El asistente no solicita ni muestra
su contenido. El dominio, el remitente y la URL pública se definen en el
archivo de Compose de Resend.

La configuración admite una contraseña directa mediante `SMTP_PASSWORD`
o un archivo mediante `SMTP_PASSWORD_FILE`, pero no ambos a la vez. También
valida que TLS directo y STARTTLS no estén activos simultáneamente.

El worker reintenta los fallos temporales hasta tres veces, con esperas de
30, 60 y 120 segundos. Cada tarea conserva una clave de idempotencia para
que Resend pueda reconocer los reintentos. Los fallos definitivos se
registran como errores. Los argumentos del correo se ocultan en los eventos
de Celery y los errores de envío omiten el contenido de la respuesta SMTP.

## Respuestas a los correos

El despliegue público utiliza `accounts@manualito.dev` como remitente y
`support@manualito.dev` como dirección de respuesta mediante `Reply-To`.
Cloudflare Email Routing reenvía las respuestas a un buzón externo cuyo
destino se configura en el proveedor y no se publica en el repositorio.

El envío por Resend y la recepción mediante Cloudflare son independientes.
Email Routing no participa en el envío de los mensajes de la aplicación.

## Código relacionado

- [Configuración del backend](../backend/api/config.py).
- [Contenido y enlaces de los correos](../backend/api/auth/emails.py).
- [Plantilla HTML compartida](../backend/api/mail/templates/auth_email.html).
- [Cliente SMTP](../backend/api/mail/client.py).
- [Cola y reintentos de envío](../backend/api/worker/tasks/mail.py).

## Referencias

- [SMTP de Resend](https://resend.com/docs/send-with-smtp).
- [Secretos de Docker Compose](https://docs.docker.com/compose/how-tos/use-secrets/).
- [Combinación de archivos Compose](https://docs.docker.com/reference/compose-file/merge/).
- [Configuración de Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/).

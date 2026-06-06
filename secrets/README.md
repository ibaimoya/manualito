# Secrets locales

Estos ficheros son los secretos que usa Docker Compose para levantar la base de datos en desarrollo:

- `postgres_user.txt`: usuario de Postgres.
- `postgres_password.txt`: contraseña de Postgres.

> [!IMPORTANT]
> Estos valores están en el repositorio para que el proyecto se pueda clonar y arrancar tal cual durante el TFG. Si usas Manualito fuera de ese contexto, cambia ambos ficheros y gestiona los secretos desde el sistema de despliegue o un gestor de secretos.

Compose los monta como ficheros dentro de los contenedores en `/run/secrets/...`; el backend y Postgres los leen desde ahí.

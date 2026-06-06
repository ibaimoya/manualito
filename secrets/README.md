# Secrets locales

Estos ficheros son los secretos que usa Docker Compose para levantar la base de datos en desarrollo:

- `postgres_user.txt`: usuario de Postgres.
- `postgres_password.txt`: contraseña de Postgres.

Están en el repositorio para que el proyecto se pueda clonar y arrancar tal cual durante el TFG, sin pasos manuales raros ni credenciales externas. Son valores locales, pensados para el entorno de desarrollo de Manualito.

Si se usa este proyecto fuera de ese contexto, no reutilices estos valores. Cambia ambos ficheros antes de exponer la aplicación, usa credenciales propias por entorno y, en despliegues reales, gestiona los secretos desde el sistema de despliegue o un gestor de secretos.

Compose los monta como ficheros dentro de los contenedores en `/run/secrets/...`; el backend y Postgres los leen desde ahí.

# Secrets locales

Estos ficheros son los secretos que usa Docker Compose para levantar los servicios en desarrollo:

- `postgres_user.txt`: usuario de Postgres.
- `postgres_password.txt`: contraseña de Postgres.
- `redis_password.txt`: contraseña local de Redis para Celery.
- `flower_basic_auth.txt`: credenciales `usuario:contraseña` para Flower.

> [!IMPORTANT]
> Estos valores están en el repositorio para que el proyecto se pueda clonar y arrancar tal cual durante el TFG. Si usas Manualito fuera de ese contexto, cambia estos ficheros y gestiona los secretos desde el sistema de despliegue o un gestor de secretos.

Compose los monta como ficheros dentro de los contenedores en `/run/secrets/...`; el backend, Postgres, Redis y Flower los leen desde ahí.

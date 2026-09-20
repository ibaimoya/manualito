// Texto y títulos conservados de los SVG de assets/anexos/documentacion-tecnica.
export const figurasCodigo = {
  '00-directorios': {
    title: 'Repositorio · Estructura principal',
    lang: 'text',
    code: `manualito/                    # Repositorio del proyecto
├── backend/                  # Lógica del servidor
│   ├── api/                  # Rutas y servicios
│   ├── common/               # Utilidades compartidas
│   ├── database/             # Modelos y migraciones
│   ├── llm/                  # Generación de respuestas
│   ├── ocr/                  # Reconocimiento de texto
│   ├── rag/                  # Búsqueda de contexto
│   └── tests/                # Pruebas del backend
├── frontend/                 # Interfaz de usuario
│   ├── public/               # Recursos estáticos
│   ├── src/                  # Código de la interfaz
│   ├── tests/                # Pruebas del frontend
│   ├── Caddyfile             # Configuración web
│   ├── package.json          # Dependencias y comandos
│   ├── pnpm-lock.yaml        # Versiones fijadas
│   ├── vite.config.ts        # Desarrollo y construcción
│   └── vitest.config.ts      # Ajustes de las pruebas
├── config/                   # Ajustes de los servicios
├── deploy/                   # Despliegue e infraestructura
├── docs/                     # Documentación del proyecto
│   ├── benchmarks/           # Pruebas comparativas
│   └── site/                 # Sitio web
├── scripts/                  # Automatización de tareas
├── .github/                  # Flujos de CI/CD
├── .pre-commit-config.yaml   # Estandarizar los commits
├── CHANGELOG.md              # Historial de cambios
├── CONTRIBUTING.md           # Guía de contribución
├── README.md                 # Presentación del proyecto
├── compose.yaml              # Servicios y contenedores
├── pyproject.toml            # Proyecto y dependencias
└── uv.lock                   # Versiones fijadas`,
  },
  '01-valoracion': {
    title: 'Python · Manejador de valoración',
    lang: 'python',
    code: `async def rate_game_handler(
    request: Request,
    auth:    CurrentAuth,
    game_id: ValidGameId,
    payload: RateGameRequest,
    session: DbSession,
    _csrf:   CsrfProtection,
) -> RatingResponse:`,
  },
  '02-migracion': {
    title: 'PowerShell · Generar una revisión',
    lang: 'powershell',
    code: `uv run --no-sync alembic -c backend/database/alembic.ini \`
    revision --autogenerate -m "descripcion del cambio"`,
  },
  '03-clonar': {
    title: 'Terminal · Obtener el proyecto',
    lang: 'bash',
    code: `git clone https://github.com/ibaimoya/manualito.git
cd manualito
git switch development
git log -1 --oneline`,
  },
  '04-arranque-windows': {
    title: 'PowerShell · Preparar y arrancar',
    lang: 'powershell',
    code: `.\\setup.bat
.\\start.bat`,
  },
  '05-arranque-linux': {
    title: 'Bash · Preparar y arrancar',
    lang: 'bash',
    code: `bash setup.sh
bash start.sh`,
  },
  '07-preparar-pruebas': {
    title: 'Terminal · Preparar las pruebas',
    lang: 'bash',
    code: `uv sync --locked --no-default-groups --only-group test`,
  },
  '08-construir-interfaz': {
    title: 'Terminal · Construir la interfaz',
    lang: 'bash',
    code: `cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build`,
  },
  '09-registros': {
    title: 'Terminal · Estado y registros',
    lang: 'bash',
    code: `docker compose ps --all
docker compose logs --tail 100 api
docker compose logs --tail 100 ocr rag llm`,
  },
  '10-pruebas-servidor': {
    title: 'Terminal · Pruebas del servidor',
    lang: 'bash',
    code: `uv run --no-sync pytest backend/tests scripts/hooks/tests`,
  },
  '11-fusion': {
    title: 'Terminal · Combinación de candidatos',
    lang: 'bash',
    code: `uv run --no-sync pytest backend/tests/rag/test_fusion.py`,
  },
  '12-esquema': {
    title: 'Terminal · Esquema de pruebas',
    lang: 'bash',
    code: `uv run --no-sync alembic -c backend/database/alembic.ini upgrade head
uv run --no-sync alembic -c backend/database/alembic.ini check
uv run --no-sync pytest backend/tests/api -k conversations_reply_real`,
  },
  '13-cobertura': {
    title: 'Terminal · Cobertura de la interfaz',
    lang: 'bash',
    code: `pnpm routes:generate
pnpm test
pnpm test:coverage`,
  },
};

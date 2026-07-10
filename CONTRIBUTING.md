# Flujo de desarrollo

## Ramas

Las ramas de trabajo siguen `<tipo>/<issue>-<slug>`:

```text
chore/63-standardize-development-workflow
feat/62-add-pdf-upload
fix/41-session-cookie
```

Los tipos admitidos son `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `hotfix`,
`perf`, `refactor`, `revert`, `style` y `test`. La issue debe ser positiva y el
slug debe estar en minúsculas y kebab-case. `master`, `development` y `staging`
no admiten commits directos.

## Commits

El hook `commit-msg` aplica [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
y la política de Manualito:

- Formato `type(scope)!: descripción (#N)`.
- Tipos de commit: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
  `refactor`, `revert`, `style` y `test`.
- Scope opcional, en minúsculas y kebab-case.
- Descripción de al menos 10 caracteres, comenzada en minúscula, sin espacios
  sobrantes, emoji ni punto final.
- Cabecera completa de 72 caracteres como máximo.
- La issue principal se obtiene de la rama y se añade si falta.
- `!` y `BREAKING CHANGE: <descripción>` deben aparecer juntos.

No se comprueba la forma verbal de la descripción.

### Issues relacionadas

La cabecera solo conserva la issue de la rama. Las demás se trasladan a un
footer `Refs:`:

```text
chore(deps): actualizadas dependencias (#41)

Refs: #42, #43
```

En la rama de la issue 41, tanto `(#41)(#42)` como `(#41, #42)` se normalizan
al ejemplo anterior. El hook rechaza issues duplicadas, una issue principal
repetida en `Refs:`, referencias `#N` fuera del sufijo o de `Refs:` y cualquier
sufijo que no contenga exactamente una vez la issue de la rama.

## Activación

Si el repositorio ya usa un dispatcher mediante `core.hooksPath` y este ejecuta
pre-commit para cada stage, no hace falta instalar otro hook. Es el caso del
proxy local de sincronización de Manualito.

En un clon sin `core.hooksPath` personalizado, la configuración instala los
stages `pre-commit` y `commit-msg`:

```bash
git config --get core.hooksPath
uv sync --locked --no-default-groups --only-group dev
uv run --locked --no-default-groups --only-group dev pre-commit install --install-hooks
```

El primer comando no debe devolver ninguna ruta. Si existe una configuración
personalizada, hay que integrar pre-commit en ese dispatcher en lugar de
sobrescribirlo.

El hook puede normalizar o rechazar el mensaje porque Git permite que
[`commit-msg`](https://git-scm.com/docs/githooks#_commit_msg) modifique su
fichero. Puede omitirse localmente mediante `--no-verify`; las protecciones de
ramas y revisiones siguen siendo la garantía compartida.

El número se valida sintácticamente contra la rama. Comprobar que la issue
existe o que representa conceptualmente el cambio exigiría consultar GitHub y
queda fuera del hook local.

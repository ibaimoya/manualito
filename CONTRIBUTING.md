# Flujo de desarrollo

---

## Issues

Crea cada issue con la plantilla correspondiente y completa sus apartados. Las
plantillas asignan el tipo y `status:needs-triage`. Antes de retirar este estado,
la issue debe tener exactamente una etiqueta de tipo (`type::...`) y una de
prioridad (`priority::...`), además de al menos un tópico (`topic:...`).

Se pueden acumular tantos tópicos como sean relevantes. Los estados (`status:`) son
temporales y solo puede haber uno a la vez. La taxonomía completa y sus criterios
de uso se detallarán en la documentación técnica.

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
- Objetivo opcional, en minúsculas y kebab-case.
- Descripción de al menos 10 caracteres, comenzada en minúscula, sin espacios
  sobrantes, emoji ni punto final.
- Las secuencias de dos o más espacios de la cabecera se reducen automáticamente
  a un único espacio. El cuerpo y los footers no se modifican.
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

## Archivos

El stage `pre-commit` aplica comprobaciones sobre los archivos staged, además de
comprobar el estilo del mensaje del commit:

- `trailing-whitespace` elimina espacios y tabuladores al final de las líneas.
- `end-of-file-fixer` garantiza que los archivos de texto estén vacíos o
  terminen con exactamente un salto de línea.
- `check-merge-conflict` bloquea archivos con marcadores de conflicto sin
  modificarlos, incluso cuando Git no tiene un merge en curso.

`trailing-whitespace` conserva los dos espacios que representan un salto de
línea en Markdown. Los hooks de autocorrección no modifican `uv.lock` ni
`frontend/pnpm-lock.yaml`.

Si un hook corrige un archivo, el commit se cancela para poder revisar el cambio.
Después hay que ejecutar `git add` de nuevo y repetir el commit.

## Activación

Si el repositorio ya usa un dispatcher mediante `core.hooksPath` y este ejecuta
pre-commit para los stages `pre-commit` y `commit-msg`, no hace falta instalar
otro hook. Es el caso del proxy local de sincronización de Manualito.

En un clon sin `core.hooksPath` personalizado, la configuración instala los
hooks necesarios para los stages `pre-commit` y `commit-msg`:

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

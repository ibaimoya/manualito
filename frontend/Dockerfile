# syntax=docker/dockerfile:1.7
#
# Manualito · Frontend (React + Vite + PWA)
#
# Multi-stage:
#   - builder  : node:24-slim + pnpm 11 → bundle estático en /app/dist
#   - runtime  : nginx:1.27-alpine sirviendo el dist + proxy_pass /api → api:8000
#
# Hardening (en runtime):
#   - usuario no-root (1001:1001)
#   - read-only filesystem (compose monta tmpfs en /var/cache/nginx, /var/run, /var/log/nginx)
#   - no-new-privileges + cap_drop ALL (vía Docker Compose)

ARG NODE_VERSION=24
ARG NGINX_VERSION=1.27
ARG PNPM_VERSION=11.3.0

# ============================================================
# Stage 1: builder
# ============================================================
FROM node:${NODE_VERSION}-slim AS builder
ARG PNPM_VERSION

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prefer-offline

COPY . .

RUN pnpm build && pnpm store prune

# ============================================================
# Stage 2: runtime
# ============================================================
FROM nginx:${NGINX_VERSION}-alpine AS runtime

# Usuario no-root.  Nginx por defecto corre como root para bindear <1024,
# pero exponemos 8080 (>1024) y reasignamos perms a appuser.
RUN addgroup -g 1001 -S appuser \
    && adduser -u 1001 -S appuser -G appuser \
    && chown -R appuser:appuser /var/cache/nginx /var/run /var/log/nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown appuser:appuser /var/run/nginx.pid \
    # quitamos el default.conf de upstream para evitar conflicto
    && rm -f /etc/nginx/conf.d/default.conf

COPY --from=builder --chown=appuser:appuser /app/dist /usr/share/nginx/html

COPY --chown=appuser:appuser nginx.conf /etc/nginx/conf.d/default.conf

# Mete el wget (la base alpine ya lo tiene), confirma puerto y user.
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

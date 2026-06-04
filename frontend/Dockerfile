# syntax=docker/dockerfile:1

ARG NODE_VERSION
ARG NGINX_VERSION

# Stage: build.
FROM node:${NODE_VERSION:?NODE_VERSION_no_definida}-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN --mount=type=cache,target=/root/.npm \
    PNPM_VERSION="$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')" \
    && npm install --global "pnpm@${PNPM_VERSION}"

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --store-dir=/pnpm/store

COPY . .

RUN pnpm build

# Stage: runtime.
FROM nginx:${NGINX_VERSION:?NGINX_VERSION_no_definida}-alpine AS runtime

RUN addgroup -g 1001 -S appuser \
    && adduser -u 1001 -S appuser -G appuser \
    && chown -R appuser:appuser /var/cache/nginx /var/run /var/log/nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown appuser:appuser /var/run/nginx.pid \
    && rm -f /etc/nginx/conf.d/default.conf

COPY --from=builder --chown=appuser:appuser /app/dist /usr/share/nginx/html

COPY --chown=appuser:appuser nginx.conf /etc/nginx/conf.d/default.conf

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

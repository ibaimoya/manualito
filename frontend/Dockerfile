# syntax=docker/dockerfile:1

ARG NODE_VERSION
ARG NODE_VARIANT
ARG CADDY_VERSION
ARG CADDY_DIGEST
ARG EDGE_NET_SUBNET

# Stage: build.
FROM node:${NODE_VERSION:?NODE_VERSION_no_definida}${NODE_VARIANT:+-${NODE_VARIANT}} AS builder

WORKDIR /app

COPY --link package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN --mount=type=cache,target=/root/.npm \
    PNPM_VERSION="$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')" \
    && npm install --global "pnpm@${PNPM_VERSION}"

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --store-dir=/pnpm/store

COPY --link . .

RUN pnpm build

# Stage: runtime.
FROM caddy:${CADDY_VERSION:?CADDY_VERSION_no_definida}@${CADDY_DIGEST:?CADDY_DIGEST_no_definido} AS runtime

ARG EDGE_NET_SUBNET
ENV EDGE_NET_SUBNET=${EDGE_NET_SUBNET}

RUN addgroup -g 1001 -S appuser \
    && adduser -u 1001 -S appuser -G appuser \
    && setcap -r /usr/bin/caddy \
    && chown -R appuser:appuser /data /config

COPY --link --from=builder --chown=1001:1001 /app/dist /srv

COPY --link --chown=1001:1001 Caddyfile /etc/caddy/Caddyfile

RUN caddy fmt --diff /etc/caddy/Caddyfile \
    && XDG_DATA_HOME=/tmp/caddy-validation \
        caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
    && rm -rf "/tmp/caddy-validation"

USER appuser

EXPOSE 8080 8082 8443 8444

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8082/healthz || exit 1

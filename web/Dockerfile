# build context is the repository root - the bun lockfile lives there
# since the web app is a workspace member.

FROM oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lock ./
COPY web/package.json web/
RUN bun install --frozen-lockfile

COPY web web

ARG APP_COMMIT_SHA=docker
ENV APP_COMMIT_SHA=$APP_COMMIT_SHA

WORKDIR /app/web
RUN bun run build

FROM nginx:1.27-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80

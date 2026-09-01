FROM node:24-bookworm-slim AS web
WORKDIR /src
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN pnpm build

FROM golang:1.25-bookworm AS server
WORKDIR /src
COPY apps/server/go.mod apps/server/go.sum ./
RUN go mod download
COPY apps/server ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /notespace ./cmd/notespace

FROM alpine:3.22
RUN addgroup -g 10001 notespace && adduser -D -u 10001 -G notespace notespace \
    && mkdir -p /data && chown notespace:notespace /data
WORKDIR /app
COPY --from=server /notespace /app/notespace
COPY --from=web /src/apps/web/dist/client /app/web
ENV NOTESPACE_ADDR=0.0.0.0:8080 NOTESPACE_DB=/data/notespace.db NOTESPACE_WEB_DIR=/app/web
USER notespace
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -q --spider http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/app/notespace"]

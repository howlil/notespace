FROM oven/bun:1.4.5@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS web
WORKDIR /src
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN bun run --filter @notespace/web build

FROM golang:1.25-bookworm@sha256:3b4a11519ad929d1e1d261a12cff056f0c85b735253d7d861346b9c6f8b36437 AS server
WORKDIR /src
COPY apps/server/go.mod apps/server/go.sum ./
RUN go mod download
COPY apps/server ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /notespace ./cmd/notespace

FROM alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f
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

FROM oven/bun:1.3.12-debian@sha256:1b709c9dd883fc1af38c210f7ea5222c552a8d470ea73efbd4b8fcfee798a64b AS bun

FROM node:22.21.1-trixie-slim@sha256:98e1429d1a0b99378b4de43fa385f0746fd6276faf4feeb6104d91f6bad290f9
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bunx /usr/local/bin/
COPY . /app
WORKDIR /app

RUN bun install --frozen-lockfile && \
    bun run build && \
    bun clean:cache && \
    bun clean:modules && \
    bun install --production --frozen-lockfile

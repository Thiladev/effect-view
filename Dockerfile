FROM oven/bun:1.3.14-debian@sha256:9dba1a1b43ce28c9d7931bfc4eb00feb63b0114720a0277a8f939ae4dfc9db6f AS bun

FROM node:22.23.2-trixie-slim@sha256:517aa41d78545cb1b8c67b13655b4c13ede1ee9df1da8aab54cd7434aefbcaf8
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bunx /usr/local/bin/
COPY . /app
WORKDIR /app

RUN bun install --frozen-lockfile && \
    bun run build && \
    bun clean:cache && \
    bun clean:modules && \
    bun install --production --frozen-lockfile

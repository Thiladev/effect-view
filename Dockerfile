FROM oven/bun:1.4.0-debian@sha256:5bb0f9be3a1a36a03e27c9a9dd894a3b1ad26657155c7df4dda771e17bf872ef AS bun

FROM node:24.19.0-trixie-slim@sha256:0711b541c1c33a8a530ac4f0d391baa9a15b3d804695b1b24a47daa5fb60e74d
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bunx /usr/local/bin/
COPY . /app
WORKDIR /app

RUN bun install --frozen-lockfile && \
    bun run build && \
    bun clean:cache && \
    bun clean:modules && \
    bun install --production --frozen-lockfile --ignore-scripts

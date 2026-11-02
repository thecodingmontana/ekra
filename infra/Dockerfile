# Production images for the API (target: server), the web app (target: web) and the worker (target: worker).
# Built on the server by scripts/setup.sh and `ekra update`: the web app's address (BETTER_AUTH_URL) is part of
# its browser code, so each install builds its own image.
FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@12.11.2
WORKDIR /app
COPY . .
# no package scripts: the only one installs git hooks, and there's no git repo here
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS web-build
ARG BETTER_AUTH_URL
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
RUN pnpm --filter @ekra/web build

FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY --from=web-build /app/apps/web/.output ./.output
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

# Node runs the API's TypeScript directly, so it keeps the workspace (packages are TypeScript too)
FROM base AS server
ENV NODE_ENV=production SERVER_HOST=0.0.0.0 SERVER_PORT=4000
WORKDIR /app/apps/server
EXPOSE 4000
CMD ["node", "src/index.ts"]

# The background worker: the same workspace, plus ffmpeg for turning uploaded videos into streams
FROM base AS worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["node", "src/index.ts"]

FROM node:24.12.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:24.12.0-bookworm-slim AS runtime-base

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY --from=build /app /app

FROM runtime-base AS api
EXPOSE 3100
CMD ["node", "apps/api/dist/main.js"]

FROM runtime-base AS worker
EXPOSE 3200
CMD ["node", "apps/worker/dist/main.js"]

FROM runtime-base AS web
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]

FROM runtime-base AS database-migrate
CMD ["node", "packages/database/dist/migrate.js"]

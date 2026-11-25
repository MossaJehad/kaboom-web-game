FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.23.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile --filter @skyhop/api...
RUN pnpm --filter @skyhop/shared build && \
    pnpm --filter @skyhop/game-core build && \
    pnpm --filter @skyhop/database build && \
    pnpm --filter @skyhop/api build

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.23.0 --activate
ENV NODE_ENV=production

COPY --from=builder /app ./
EXPOSE 3001
CMD ["sh", "-c", "cd packages/database && npx prisma migrate deploy && pnpm db:seed && cd /app && node apps/api/dist/server.js"]

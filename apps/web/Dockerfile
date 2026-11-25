FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.23.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/game-core ./packages/game-core
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile --filter @skyhop/web...
RUN pnpm --filter @skyhop/shared build && \
    pnpm --filter @skyhop/game-core build && \
    pnpm --filter @skyhop/web build

FROM nginx:1.27-alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

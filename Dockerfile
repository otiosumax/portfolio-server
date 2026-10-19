# syntax=docker/dockerfile:1

# --- 1. Зависимости: отдельный слой, кешируется при правках кода ---
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- 2. Рантайм ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# каталог под данные + права для пользователя node (uid 1000)
RUN mkdir -p /data && chown -R node:node /data

USER node

ENV PORT=3000 \
    DATA_FILE=/data/data.json

EXPOSE 3000
VOLUME ["/data"]

# curl в node:alpine нет — проверяем через сам Node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/projects').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.ts"]

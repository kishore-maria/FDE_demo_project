# syntax=docker/dockerfile:1
# Single-service image: the API also serves the built web app (one URL, no proxy). Used by render.yaml.
# docker-compose.yml keeps using packages/api/Dockerfile + packages/web/Dockerfile (nginx).
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci -w packages/web -w packages/shared
COPY packages/shared packages/shared
COPY packages/web packages/web
ENV VITE_API_URL=/api
RUN npm run build -w packages/web

FROM node:20-alpine
# Prisma's query/schema engines need OpenSSL.
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci --omit=dev -w packages/api -w packages/shared && npm cache clean --force

COPY packages/shared packages/shared
COPY packages/api packages/api
COPY --from=web /app/packages/web/dist /app/web

WORKDIR /app/packages/api
ENV PATH=/app/node_modules/.bin:$PATH \
    WEB_DIST_DIR=/app/web
RUN prisma generate \
  && sed -i 's/\r$//' docker-entrypoint.sh \
  && chmod +x docker-entrypoint.sh

USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/api/health" > /dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]

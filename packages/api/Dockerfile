# syntax=docker/dockerfile:1
# BookWorm API. Build context = repository root:
#   docker build -f packages/api/Dockerfile .
FROM node:20-alpine

# Prisma's query/schema engines need OpenSSL.
RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies for the api + shared workspaces only (layer cached until a manifest changes).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci --omit=dev -w packages/api -w packages/shared && npm cache clean --force

COPY packages/shared packages/shared
COPY packages/api packages/api

WORKDIR /app/packages/api
ENV PATH=/app/node_modules/.bin:$PATH
RUN prisma generate \
  && sed -i 's/\r$//' docker-entrypoint.sh \
  && chmod +x docker-entrypoint.sh

USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/api/health" > /dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]

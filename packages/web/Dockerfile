# syntax=docker/dockerfile:1
# BookWorm web app: Vite build served by nginx, which also proxies /api to the api service.
# Build context = repository root:
#   docker build -f packages/web/Dockerfile --build-arg VITE_API_URL=/api .
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci -w packages/web -w packages/shared

COPY packages/shared packages/shared
COPY packages/web packages/web

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w packages/web

FROM nginx:1.27-alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80

# Multi-stage Dockerfile for Angular dev (hot reload) and unprivileged Nginx prod.
FROM node:22-alpine AS deps

WORKDIR /app
RUN chown -R node:node /app

USER node
COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund


FROM deps AS dev

WORKDIR /app
USER node

EXPOSE 4200

CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200", "--proxy-config", "proxy.conf.json", "--poll", "2000"]


FROM deps AS builder

WORKDIR /app
USER node

COPY --chown=node:node . .
RUN npm run build


FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/tripilot-web/browser /usr/share/nginx/html

EXPOSE 8080

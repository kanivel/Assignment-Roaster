# frontend/Dockerfile
# Multi-stage build: Vite production bundle is built with Node and served by nginx.

# ---------- Stage 1: build ----------
FROM node:22-alpine AS build

WORKDIR /app

# Vite env vars are baked into the bundle at build time.
# Leave empty in production so the app uses relative /api/ URLs proxied by nginx.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Stage 2: serve ----------
FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

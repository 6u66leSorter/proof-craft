# Образ web: сборка React-клиента и nginx со статикой и прокси /api → api.
# Контекст сборки — корень репозитория: клиент использует общие стили и public/ legacy.

FROM node:22-bookworm-slim AS build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
# npm иногда не ставит платформенный бинарник rolldown (npm/cli#4828) — доустанавливаем при необходимости.
RUN node -e "import('rolldown').then(() => process.exit(0), () => process.exit(1))" \
 || npm install --no-save --ignore-scripts "@rolldown/binding-linux-$(node -p process.arch)-gnu@$(node -p "require('rolldown/package.json').version")"
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig.json ./
COPY frontend/src ./src
COPY src/index.css /build/src/index.css
COPY files_new/styles.css /build/files_new/styles.css
COPY public /build/public
# Клиент ходит в относительный /api — тот же origin, что и nginx.
RUN node node_modules/vite/bin/vite.js build

FROM nginx:1.27-alpine AS runtime
COPY frontend/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/frontend/dist /usr/share/nginx/html
EXPOSE 80

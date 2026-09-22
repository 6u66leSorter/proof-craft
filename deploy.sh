#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/barber/app"

cd "$APP_DIR"

# Backup DB before pulling new code
if [ -f "./data/barber.db" ]; then
  npm run db:backup
else
  echo "Skipping DB backup: ./data/barber.db not found"
fi

git pull --ff-only

# Чистая установка: иначе npm ci/npm install часто падают с ENOTEMPTY (rmdir ... not empty)
# на проде — после частичных обновлений, NFS или параллельного доступа к node_modules.
rm -rf node_modules

if ! npm ci --no-audit --no-fund; then
  echo "npm ci failed (несовпадение lockfile или другая ошибка), пробуем npm install..."
  npm install --no-audit --no-fund
fi

# Сборка фронта: пути в коде уже /api/...; база — пустая (тот же origin) или https://host БЕЗ /api
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-}"
npm run build

# Restart services
pm2 startOrRestart ecosystem.config.cjs --update-env

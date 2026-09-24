#!/bin/sh
set -e
# Только один сервис (api) создаёт и мигрирует схему, чтобы api и bot не делали это одновременно.
if [ "${INIT_SCHEMA:-0}" = "1" ]; then
  node --input-type=module -e "await import('/app/legacy/bot/database.js')"
fi
exec "$@"

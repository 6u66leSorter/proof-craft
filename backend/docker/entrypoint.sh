#!/bin/sh
set -e
# Схему создаёт только api (INIT_SCHEMA=1), чтобы api и bot не делали это одновременно.
if [ "${INIT_SCHEMA:-0}" = "1" ]; then
  node dist/database/init-schema.js
fi
exec "$@"

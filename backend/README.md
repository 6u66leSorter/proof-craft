# Proof Craft backend

Переходный NestJS backend работает рядом с legacy Fastify API. Реализованы совместимый `GET /health` и `nest-ready` маршрут `GET /api/session`; production routing пока остаётся на legacy.

## Команды

Из корня проекта:

```bash
npm run backend:dev
npm run backend:build
npm run test:backend
```

После нового клонирования зависимости backend устанавливаются отдельно:

```bash
npm --prefix backend install
```

По умолчанию Nest слушает `127.0.0.1:8788`, а legacy API — порт `8787`. Переопределение:

```bash
NEST_API_HOST=127.0.0.1 NEST_API_PORT=8788 npm run backend:start
```

На миграционном этапе маршруты переключаются на Nest по одному. Нельзя направлять весь `/api` в новый процесс, пока все маршруты не перенесены.

## Prisma baseline

Схема находится в `backend/prisma/schema.prisma` и отражает 19 legacy-таблиц. Runtime требует абсолютный SQLite URL:

```bash
DATABASE_URL=file:/absolute/path/to/barber.db npm run backend:start
```

`/api/session` поддерживает те же credentials, что legacy: Telegram init data, подписанные VK launch params и web-session. Для строгого Telegram-режима задаются `TG_WEBAPP_AUTH=strict` и `BOT_TOKEN`; для VK — `VK_APP_ID`, `VK_APP_SECRET` и при необходимости `VK_ID_OFFSET`.

Безопасные команды:

```bash
npm --prefix backend run prisma:validate
npm --prefix backend run prisma:generate
```

На baseline-этапе запрещены `prisma db push`, `prisma migrate dev` и `prisma migrate deploy`: миграций Prisma ещё нет, источником структуры остаётся `bot/database.js`.

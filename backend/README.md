# Proof Craft backend

Переходный NestJS backend работает рядом с legacy Fastify API. Пока в нём есть только совместимый `GET /health`; Prisma и бизнес-модули не подключены.

## Команды

Из корня проекта:

```bash
npm run backend:dev
npm run backend:build
npm run test:backend
```

По умолчанию Nest слушает `127.0.0.1:8788`, а legacy API — порт `8787`. Переопределение:

```bash
NEST_API_HOST=127.0.0.1 NEST_API_PORT=8788 npm run backend:start
```

На миграционном этапе маршруты переключаются на Nest по одному. Нельзя направлять весь `/api` в новый процесс, пока все маршруты не перенесены.

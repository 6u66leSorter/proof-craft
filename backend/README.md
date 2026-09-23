# Proof Craft backend

Переходный NestJS backend работает рядом с legacy Fastify API. Реализованы `GET /health`, `GET /api/session`, публичное портфолио, авторизованная showcase-витрина, уведомления, чтение работ, чтение и загрузка аватаров учеников, а также авторизованные файлы работы с вложениями; production routing пока остаётся на legacy.

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

Публичный список отдаёт только профили `studying`. В отличие от небезопасного legacy-поведения, `works_count` и `GET /api/guest/students/:student_id/portfolio` учитывают только работы со статусом `approved`. Признаки локальных файлов проверяются относительно каталога `uploads` рядом с SQLite из `DATABASE_URL`.

Публичный аватар отдаётся только для профиля `studying`. Файловый adapter разрешает реальный путь и отклоняет файлы вне каталога `uploads`, после чего controller потоково возвращает JPEG с публичным кэшированием на час.

Публичные `GET /api/guest/homeworks/:id/file` и `GET /api/guest/homeworks/:homeworkId/attachments/:attachmentId/file` отдают только `approved`-работы учеников `studying`. Вложение обязано принадлежать работе из URL. Storage adapter потоково отдаёт локальный или Telegram-файл и поддерживает JPEG-preview для локальных фото.

`GET /api/showcase/homeworks` и его файловый маршрут требуют Telegram/VK/web-session credential. Список содержит только `approved` фото/видео с доступным файлом, убирает повторы и сохраняет legacy-поведение `limit`, `exclude_ids` и `cycled`.

`GET /api/notifications` и `POST /api/notifications/read` требуют общий credential и не доверяют `telegram_id` как identity. Чтение и отметка одной/всех записей ограничены внутренним user ID. Лимит `1..80`, unread-счётчик, JSON payload, идемпотентная отметка и почасовая retention-очистка совместимы с legacy.

`GET /api/student/homeworks` возвращает только работы student-профиля, связанного с проверенным principal. Ответ сохраняет legacy-сортировку (`pending` сверху), все проверки и комментарии, последнюю проверку, вложения, признаки local/Telegram-файлов и рейтинг по `approved`-оценкам.

`GET /api/homeworks/:id/file` проверяет владельца, назначение преподавателя или роль администратора по проверенному principal. Общий storage adapter безопасно открывает local/Telegram-файл и создаёт JPEG-preview фото; форма ошибок и заголовки совместимы с legacy.

`GET /api/homeworks/:homeworkId/revision/file` использует тот же access boundary, всегда трактует локальный revision-файл как изображение и поддерживает preview. Отсутствующий `revision_student_file_id` сохраняет legacy-ответ `Файл исправления не найден.`.

`GET /api/homeworks/:homeworkId/attachments/:attachmentId/file` сначала подтверждает принадлежность вложения работе из URL, затем применяет ту же ролевую матрицу. Общий storage adapter отдаёт local/Telegram-файл и создаёт preview только для `photo`.

`GET /api/student/me/avatar` находит student-профиль только по внутреннему user ID проверенного principal и отдаёт локальный JPEG через общий storage adapter с `private, max-age=3600`. Отсутствующий профиль сохраняет legacy-ответ `Аватар не установлен.`.

`GET /api/students/:student_id/avatar` переиспользует файловую логику, но разрешает доступ только владельцу, назначенному преподавателю или администратору. Для совместимости access-check выполняется раньше проверки существования профиля.

`POST /api/student/me/avatar` потоково принимает multipart-файл с лимитом `MAX_HOMEWORK_UPLOAD_MB`, создаёт JPEG 400×400 и только затем обновляет student через Prisma. Новый файл очищается при ошибке БД или обработки; старый удаляется после успешного обновления и только если находится внутри `uploads`.

Безопасные команды:

```bash
npm --prefix backend run prisma:validate
npm --prefix backend run prisma:generate
```

На baseline-этапе запрещены `prisma db push`, `prisma migrate dev` и `prisma migrate deploy`: миграций Prisma ещё нет, источником структуры остаётся `bot/database.js`.

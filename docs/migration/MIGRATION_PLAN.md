# План поэтапной миграции backend

## Переходная топология

До полного cutover одновременно существуют два процесса:

```text
client -> nginx/router -> legacy Fastify :8787
                     \-> NestJS Fastify :8788 (только явно переключённые пути)
```

Нельзя направлять весь `/api` в NestJS до переноса последнего маршрута. Переключение выполняется точным путём либо небольшим согласованным набором путей.

## Этапы

### 0. Baseline — завершён

- Реестр 58 маршрутов.
- Решения по совместимости и известным дефектам.
- Изолированная временная SQLite-БД.
- Characterization-тесты legacy API.

### 1. Параллельный NestJS-каркас — завершён

- NestJS с Fastify adapter в `backend/`.
- Независимые package, build, typecheck и test.
- Совместимый `GET /health`.
- Совместимый `/health` покрыт e2e-тестом; production routing не менялся.

### 2. Prisma baseline — завершён

- Интроспектирована временная копия текущей SQLite: 19 моделей.
- Физические имена сохранены без переименования; drift проверяет e2e-тест.
- `db push` и Prisma migrations запрещены до отдельного решения.
- Создан repository boundary; controller не обращается к Prisma напрямую.

### 3. Identity и авторизация — завершён

- Проверяются Telegram init data, VK launch params и web-session.
- `CurrentPrincipal`, authentication guard и role guard доступны следующим модулям.
- `telegram_id` сохраняется на HTTP-границе, но сопоставляется с подписанным credential.
- Общая identity-логика покрыта e2e-тестами через `/api/session`.

### 4. Перенос маршрутов — начат

Порядок: session → публичные GET → уведомления/профили → административные GET → регистрации и модерация → назначения → чаты → домашние задания и файлы → проверки → web-auth/VK → Telegram-бот.

- `GET /api/session` реализован в NestJS и имеет статус `nest-ready`; production routing ещё обслуживает legacy.
- `GET /api/guest/portfolio-students` реализован в NestJS; его `works_count` считает только публичные `approved` работы и не повторяет `SEC-001`.
- `GET /api/guest/students/:student_id/portfolio` реализован в NestJS и возвращает только `approved` работы и их вложения.
- `GET /api/guest/students/:student_id/avatar` реализован в NestJS с безопасным разрешением пути и потоковой отдачей.
- `GET /api/guest/homeworks/:id/file` и `GET /api/guest/homeworks/:homeworkId/attachments/:attachmentId/file` реализованы в NestJS: только `approved`, с проверкой принадлежности вложения, local/Telegram streaming и photo preview.
- `GET /api/showcase/homeworks` и `GET /api/showcase/homeworks/:id/file` реализованы в NestJS с общей credential-проверкой, Prisma repository, дедупликацией, `exclude_ids`/`cycled` и общим storage adapter.
- `GET /api/notifications` реализован в NestJS с общей identity-границей, изоляцией user ID, JSON payload, unread-счётчиком и retention-сервисом.
- `POST /api/notifications/read` реализован в NestJS: поддерживает точечную и массовую идемпотентную отметку только своих уведомлений через Prisma repository.
- `GET /api/student/homeworks` реализован в NestJS: identity ограничивает выборку внутренним student-профилем, агрегат сохраняет сортировку, проверки, комментарии, вложения и рейтинг legacy API.
- `GET /api/homeworks/:id/file` реализован в NestJS: основной local/Telegram-файл и JPEG-preview доступны только владельцу, назначенному преподавателю или администратору.
- `GET /api/homeworks/:homeworkId/revision/file` реализован в том же модуле: файл исправления переиспользует access boundary, local/Telegram storage и preview.
- `GET /api/homeworks/:homeworkId/attachments/:attachmentId/file` реализован в том же модуле: вложение обязано принадлежать работе, а доступ, local/Telegram storage и photo preview переиспользуют общие границы.
- `GET /api/student/me/avatar` реализован в отдельном StudentAvatarsModule: student определяется по внутреннему user ID проверенного principal, а файл безопасно открывается общим storage adapter.
- `GET /api/students/:student_id/avatar` реализован в том же модуле: доступ разрешён владельцу, назначенному преподавателю и администратору по внутреннему user ID.
- `POST /api/student/me/avatar` реализован в том же модуле: multipart-поток ограничивается общей настройкой, изображение приводится к JPEG 400×400, а замена файла выполняется без потери прежнего аватара при сбое.
- `POST /api/student/about` и `POST /api/teacher/about` реализованы в общем ProfilesModule: body валидируется до credential по legacy-контракту, отдельные use cases принимают проверенный principal, а общий Prisma repository обновляет только связанный с ним профиль нужного типа.
- `POST /api/student/profile-edit` реализован в ProfilesModule: новая pending-заявка атомарно отклоняет предыдущую, профиль не меняется до одобрения, аудит и app-уведомления записываются отдельно, а Telegram-доставка администраторам выполняется best-effort через общий gateway.
- Следующий маршрут — `GET /api/admin/profile-edits`: чтение очереди pending-заявок администратором.

### 5. Вывод legacy и миграция СУБД

- Telegram-бот использует общие application services.
- Отключаются Fastify и прямой `better-sqlite3`.
- Отдельно выполняется проверяемая миграция SQLite → PostgreSQL.

## Definition of Done одного маршрута

1. Контракт и права описаны в `API_INVENTORY.md`.
2. Legacy-поведение покрыто тестом; небезопасное поведение отмечено отдельно.
3. Nest controller вызывает application service, а не Prisma напрямую.
4. Проверены HTTP-коды, JSON, изменения БД, файлы и побочные эффекты.
5. Маршрут переключается независимо и имеет простой rollback на legacy.
6. Старый обработчик удаляется только после наблюдения нового маршрута.

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

### 4. Перенос маршрутов — все 58 маршрутов `nest-ready`

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
- `GET /api/admin/profile-edits` реализован в ProfilesModule: общая admin-проверка различает неизвестного пользователя и недостаточную роль, Prisma repository возвращает только pending-заявки с текущими/предложенными данными по `created_at DESC`.
- `POST /api/admin/profile-edits/:id` реализован в ProfilesModule: approve атомарно переносит предложенные поля в student-профиль и завершает заявку, reject атомарно сохраняет комментарий, обе ветки фиксируют reviewer и best-effort аудит. Отсутствующее legacy-уведомление ученика и имя reject-события `profile_edit_rejectd` временно сохранены как `BUG-002`.
- Семь оставшихся административных GET реализованы пакетом в `AdminModule`: заявки преподавателей, приватные отзывы, преподаватели, ученики, карточка ученика, все ДЗ и аудит. Для каждого сценария сохранён отдельный use case, общий Prisma repository загружает агрегаты без запросов из controller, а file availability вычисляется общим storage adapter. `BUG-001` исправлен: `studying` и `completed` теперь фильтруются точно.
- Read-only кабинет преподавателя реализован пакетом в `TeacherCabinetModule`: dashboard, список учеников и детальная выдача работ. Общая policy ограничивает преподавателя назначенными активными учениками, а администратора без teacher-профиля допускает ко всем активным; Prisma repository формирует агрегаты, use cases — legacy-ответы, controller остаётся HTTP-границей.
- `POST /api/teacher/review` реализован в `TeacherCabinetModule`: use case сохраняет legacy-правила принятия/доработки и формирует сообщения, repository атомарно записывает проверку, статус, аудит, системное сообщение, in-app уведомление и одноразовый feedback invite, а Telegram-доставка выполняется через общий gateway после коммита.
- `POST /api/admin/students` реализован в `AdminModule`: validation guard сохраняет порядок ошибок, use case применяет admin-policy и legacy-переходы статусов, а отдельный write-repository одной Prisma-транзакцией обновляет статус, заменяет назначения только при непустом `teacher_ids` для approve, пишет аудит и in-app уведомление. Telegram-доставка выполняется после коммита.
- `POST /api/admin/teachers` реализован в `AdminModule`: назначение идемпотентно добавляет роль и создаёт профиль только при его отсутствии; снятие роли одной Prisma-транзакцией удаляет роль и текущие назначения, но сохраняет teacher-профиль и исторические проверки. Административный список, session и teacher use cases считают профиль активным только при наличии роли, а повторное назначение переиспользует прежний профиль.
- `POST /api/admin/assign-student` и `POST /api/admin/unassign-student` реализованы общим application use case и Prisma repository: связь, аудит и два app-уведомления фиксируются одной транзакцией, после чего Telegram gateway последовательно уведомляет преподавателя и ученика. Повторные вызовы сохраняют legacy side effects; уровень `barber` получает успешный ответ без создания связи, а назначать можно только преподавателя с активной ролью.
- `POST /api/admin/update-student` реализован отдельными body guard, use case и Prisma repository: поддерживает частичное обновление занятий/уровня, полную замену назначений, дедупликацию и очистку связей для `barber`. Для совместимости временно сохранён `BUG-003`: профиль изменяется до domain-валидации `teacher_ids`, поэтому ошибка может оставить частичную запись без аудита; неактивные teacher-профили отклоняются согласно `SEC-003`.
- `POST /api/admin/teacher-applications` реализован в `AdminModule`: approve/reject фиксируются через отдельный use case и Prisma repository, новые роль, профиль, статус, аудит и app-уведомление записываются атомарно, а Telegram отправляется после коммита. Legacy-ветка активного `already_teacher` сохраняет ответ без повторных side effects; сохранённый деактивированный профиль реактивируется согласно `SEC-003`.
- `POST /api/teacher-application` реализован в новом `RegistrationModule`: guard сохраняет порядок schema/auth/domain validation, use case нормализует ФИО и телефон, а Prisma repository одной транзакцией создаёт либо обновляет identity, заменяет pending-заявку и пишет app-уведомления всем администраторам. Telegram-доставка выполняется после коммита; поддержаны Telegram, VK, web-session и nginx-путь.
- `POST /api/students` реализован в `RegistrationModule`: body guard сохраняет порядок schema/auth/domain validation, use case нормализует ФИО, телефон, число занятий и метро, а Prisma repository атомарно создаёт identity, роли, student-профиль и app-уведомления администраторам. Повторная заявка сохраняет оба legacy-варианта `409`, Telegram отправляется после коммита; поддержаны Telegram, VK, web-session и nginx-путь.
- `POST /api/student/feedback` реализован там же: только проверенный principal с student-профилем может атомарно и идемпотентно сохранить приватное сообщение по `request_key`; ответ и порядок validation/auth сохранены.
- Read-пакет чатов реализован в новом `ChatModule`: `GET /api/chats/students`, `GET /api/chats/messages` и `GET /api/chats/messages/:id/file` используют общий `ChatAccessPolicy`, mapper сообщений и Prisma repository. Сохранены сортировка, `limit`, роли отправителей, порядок validation/auth/domain, `CHAT_ENABLED`, local/Telegram storage и nginx-путь; `SEC-002` исправлен ограничением преподавателя назначенными учениками.
- `POST /api/chats/messages` реализован в `ChatModule`: multipart-текст и первое вложение проходят общий auth/access boundary, изображения нормализуются в JPEG, а сообщение и app-уведомления создаются одной Prisma-транзакцией. Временные и финальные файлы очищаются при ошибках; подтверждённое исправление `SEC-002` действует и для записи. Внешних side effects у legacy-маршрута нет.
- `POST /api/homeworks` реализован в `StudentHomeworksModule`: multipart guard принимает до пяти файлов, storage boundary нормализует изображения и очищает staged/finalized-файлы, а use case проверяет статус ученика, доступность урока, состав серии и pending-дубликат. Работа, дополнительные файлы и app-уведомления записываются одной Prisma-транзакцией; Telegram-доставка преподавателям и администраторам выполняется после коммита.
- `GET /api/admin/students` без `status` возвращает всех активных (`studying` + `completed`), как legacy: на этом построены вкладка «Ученики» и категория «Барбер» обоих клиентов; явный `status` фильтрует точно (`BUG-001`).
- `POST /api/homeworks/:id/comments` реализован в `HomeworkCommentsModule`: владелец, назначенный преподаватель активного ученика или администратор; комментарий и уведомления (ученику от преподавателя, преподавателям от ученика) — одна транзакция.
- `POST /api/student/homeworks/:homeworkId/revision` реализован в `StudentHomeworksModule`: первый файл запроса, изображения → JPEG, прежний файл исправления сохраняется без нового; Telegram и app-уведомления преподавателям и администраторам. Mapper карточки работы общий со списком; в ответе, как в legacy, нет `review_count`.
- `PATCH /api/student/homeworks/:homeworkId` реализован там же: поля, удаление основного файла и вложений, новые вложения — одна транзакция с повторной проверкой `pending`; ответ — строка legacy `getHomeworkById` с флагами файлов; файлы удалённых вложений, как в legacy, остаются на диске.
- `/api/web-auth/start`, `status`, `confirm/vk`, `logout`, `session` реализованы в `WebAuthModule`: хэши одноразовых токенов, сессии на 14 дней; подтверждение из Telegram по-прежнему выполняет бот. `confirm/vk` требует совпадения `X-VK-User-Id` с подписанными launch params (`SEC-005`).
- `/api/account/vk-link-token` и `vk-link-confirm` реализованы в `AccountModule`: четырёхзначный код сохранён для совместимости клиентов и бота (`SEC-004` ждёт решения), пустой VK-аккаунт поглощается, аккаунт с данными блокирует привязку.
- Проверка в сборе: визуальный стенд в режиме `VISUAL_BACKEND=split` (маршруты `nest-ready` → NestJS) — оба клиента проходят все поведенческие сценарии и снимки, кроме гостевой витрины, где отличие — намеренное исправление `SEC-001`.
- Осталось: переключение production routing и перенос Telegram-бота на application services (этап 5).

### 5. Вывод legacy и миграция СУБД

- Telegram-бот использует общие application services — **сделано**: `backend/src/messenger/` (мессенджер-независимые сценарии, Telegram-адаптер, очередь приглашений к отзыву), отдельная точка входа `bot-main.ts`; отличия от legacy — в `BEHAVIOR_DECISIONS.md`. Следующий адаптер — MAX.
- Отключаются Fastify и прямой `better-sqlite3`.
- Отдельно выполняется проверяемая миграция SQLite → PostgreSQL.

## Definition of Done одного маршрута

1. Контракт и права описаны в `API_INVENTORY.md`.
2. Legacy-поведение покрыто тестом; небезопасное поведение отмечено отдельно.
3. Nest controller вызывает application service, а не Prisma напрямую.
4. Проверены HTTP-коды, JSON, изменения БД, файлы и побочные эффекты.
5. Маршрут переключается независимо и имеет простой rollback на legacy.
6. Старый обработчик удаляется только после наблюдения нового маршрута.

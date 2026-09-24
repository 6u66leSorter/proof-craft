# Реестр legacy API

Источник истины до завершения миграции: `bot/apiServer.js`. Всего зарегистрировано 58 маршрутов: 32 GET, 25 POST и 1 PATCH.

Статусы миграции:

- `legacy` — обслуживается Fastify;
- `covered` — текущее поведение зафиксировано тестом;
- `nest-ready` — реализовано и проверено в NestJS, но production-маршрут ещё не переключён;
- `nest` — обслуживается NestJS;
- `retired` — старый обработчик удалён.

Уровни риска:

- `low` — чтение без сложных прав и побочных эффектов;
- `medium` — авторизация, несколько таблиц или файлы;
- `high` — запись, транзакция, внешнее уведомление или чувствительные данные.

## Системные и сессионные маршруты

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/health` | публичный | Проверка процесса | low | nest-ready |
| GET | `/api/session` | Telegram, VK или web-session | Пользователь, роли, профили, рейтинг, преподаватели, непрочитанные уведомления | high | nest-ready |

## Web-аутентификация и привязка аккаунтов

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/web-auth/start` | публичный | Одноразовый запрос входа, Telegram/VK handoff URL | high | nest-ready |
| GET | `/api/web-auth/status` | одноразовый токен | Polling подтверждения и выпуск web-session | high | nest-ready |
| POST | `/api/web-auth/confirm/vk` | подписанные VK launch params | Подтверждение VK-входа | high | nest-ready |
| POST | `/api/web-auth/logout` | web-session | Удаление сессии | medium | nest-ready |
| GET | `/api/web-auth/session` | web-session | Проверка сессии сайта | medium | nest-ready |
| POST | `/api/account/vk-link-token` | Telegram | Четырёхзначный код привязки | high | nest-ready |
| POST | `/api/account/vk-link-confirm` | VK | Связывание Telegram- и VK-идентичностей | high | nest-ready |

## Уведомления

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/notifications` | Telegram, VK или web-session с существующим user | Список, JSON payload, общее число непрочитанных и retention | medium | nest-ready |
| POST | `/api/notifications/read` | Telegram, VK или web-session с существующим user | Идемпотентно отметить одно своё или все свои уведомления прочитанными | medium | nest-ready |

## Чаты

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/chats/students` | student — свой; teacher — назначенные; admin — все активные | Доступные чаты учеников с исправлением `SEC-002` | high | nest-ready |
| GET | `/api/chats/messages` | владелец, назначенный преподаватель или администратор | Последние сообщения по возрастанию, роли отправителей и `limit` | high | nest-ready |
| POST | `/api/chats/messages` | владелец, назначенный преподаватель или администратор | Multipart-сообщение, безопасный файл и атомарные app-уведомления с исправлением `SEC-002` | high | nest-ready |
| GET | `/api/chats/messages/:id/file` | владелец, назначенный преподаватель или администратор | Безопасный local/Telegram-файл через общий storage boundary | high | nest-ready |

## Домашние задания и файлы

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/student/homeworks` | Telegram, VK или web-session с существующим student | Только свои работы, все проверки, комментарии, вложения и рейтинг по принятым оценкам | high | nest-ready |
| POST | `/api/homeworks` | ученик `studying` | Multipart до 5 файлов, серии только из фото, защита от pending-дубликата, атомарные app-уведомления и best-effort Telegram | high | nest-ready |
| PATCH | `/api/student/homeworks/:homeworkId` | владелец pending-работы | Редактирование текста и вложений | high | nest-ready |
| POST | `/api/student/homeworks/:homeworkId/revision` | владелец revision-работы | Исправление и возврат в pending | high | nest-ready |
| POST | `/api/homeworks/:id/comments` | ученик, назначенный преподаватель или администратор | Комментарий и уведомления | high | nest-ready |
| POST | `/api/teacher/review` | назначенный преподаватель; администратор — любой активный ученик | Транзакционная проверка, статус, рейтинг, системное сообщение, аудит, уведомления и одноразовый feedback invite для уроков 5/10/15 | high | nest-ready |
| GET | `/api/homeworks/:id/file` | владелец, назначенный преподаватель или администратор | Основной local/Telegram-файл и JPEG-preview после проверки доступа | high | nest-ready |
| GET | `/api/homeworks/:homeworkId/revision/file` | владелец, назначенный преподаватель или администратор | Local/Telegram-файл исправления и JPEG-preview после проверки доступа | high | nest-ready |
| GET | `/api/homeworks/:homeworkId/attachments/:attachmentId/file` | владелец, назначенный преподаватель или администратор | Принадлежащее работе дополнительное вложение, local/Telegram-файл и JPEG-preview фото | high | nest-ready |

## Публичное портфолио и витрина

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/guest/portfolio-students` | публичный | Профили учеников `studying`; `works_count` считает только `approved` | medium | nest-ready |
| GET | `/api/guest/students/:student_id/portfolio` | публичный | Профиль и только `approved` работы ученика | high | nest-ready |
| GET | `/api/guest/students/:student_id/avatar` | публичный | Аватар видимого ученика из безопасного uploads-каталога | medium | nest-ready |
| GET | `/api/guest/homeworks/:id/file` | публичный | Локальный/Telegram-файл `approved`-работы видимого ученика | high | nest-ready |
| GET | `/api/guest/homeworks/:homeworkId/attachments/:attachmentId/file` | публичный | Принадлежащее работе вложение, только для `approved` | high | nest-ready |
| GET | `/api/showcase/homeworks` | подтверждённый Telegram/VK/web-session credential | Случайные `approved` фото/видео, дедупликация и циклическая выборка | medium | nest-ready |
| GET | `/api/showcase/homeworks/:id/file` | подтверждённый Telegram/VK/web-session credential | Локальный/Telegram-файл `approved` фото или видео | medium | nest-ready |

## Профиль ученика и преподавателя

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/student/about` | Telegram, VK или web-session с существующим student | Trim описания до 1000 символов; пустое значение сохраняется как `NULL` | medium | nest-ready |
| POST | `/api/teacher/about` | Telegram, VK или web-session с существующим teacher | Trim описания до 1000 символов; пустое значение сохраняется как `NULL` | medium | nest-ready |
| POST | `/api/student/profile-edit` | Telegram, VK или web-session; student `studying/completed` | Атомарная замена pending-заявки, аудит, app- и best-effort Telegram-уведомления администраторам | high | nest-ready |
| POST | `/api/student/me/avatar` | Telegram, VK или web-session с существующим student | Multipart-загрузка, JPEG-нормализация и безопасная замена аватара | high | nest-ready |
| GET | `/api/student/me/avatar` | Telegram, VK или web-session с существующим student | Собственный локальный аватар с private cache | medium | nest-ready |
| GET | `/api/students/:student_id/avatar` | владелец, назначенный преподаватель или администратор | Ролевой доступ к локальному аватару с private cache | high | nest-ready |

## Регистрация и заявки преподавателей

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/students` | подтверждённая Telegram/VK identity или web-session | Атомарное создание/обновление identity, роли и student-профиля в moderation; уведомления администраторам | high | nest-ready |
| POST | `/api/teacher-application` | подтверждённая Telegram/VK identity или web-session | Нормализация контактов, создание guest identity, атомарная замена pending-заявки и уведомление администраторов | high | nest-ready |
| GET | `/api/admin/teacher-applications` | Telegram, VK или web-session; роль admin | Необработанные заявки от новых к старым | medium | nest-ready |
| POST | `/api/admin/teacher-applications` | Telegram, VK или web-session; роль admin | Атомарное принятие/отклонение, роль и профиль преподавателя, аудит и уведомление при approve; сохранённая деактивированная карточка реактивируется по `SEC-003` | high | nest-ready |

## Конфиденциальная обратная связь

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/student/feedback` | Telegram, VK или web-session с существующим student | Приватная идемпотентная отправка по паре student + `request_key` | high | nest-ready |
| GET | `/api/admin/feedback` | Telegram, VK или web-session; роль admin | Cursor-пагинация приватных отзывов по 50 записей | high | nest-ready |

## Администрирование профилей

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/profile-edits` | Telegram, VK или web-session; роль admin | Pending-заявки с текущими и предложенными данными, новые сверху | medium | nest-ready |
| POST | `/api/admin/profile-edits/:id` | Telegram, VK или web-session; роль admin | Транзакционное принятие/отклонение и best-effort аудит; уведомление ученика отсутствует по legacy `BUG-002` | high | nest-ready |

## Администрирование учеников и преподавателей

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/teachers` | Telegram, VK или web-session; роль admin | Преподаватели, последний approved-телефон и активные закреплённые ученики | medium | nest-ready |
| GET | `/api/admin/students` | Telegram, VK или web-session; роль admin | Точная фильтрация по статусу, рейтинг, pending-счётчик и назначения | medium | nest-ready |
| GET | `/api/admin/student/:student_id` | Telegram, VK или web-session; роль admin | Полный профиль, рейтинг, назначения, работы, проверки, комментарии и вложения | high | nest-ready |
| POST | `/api/admin/update-student` | Telegram, VK или web-session; роль admin | Частичное обновление уровня/занятий и полная замена назначений; переход в barber снимает связи; временно сохранён partial-write `BUG-003` | high | nest-ready |
| POST | `/api/admin/students` | Telegram, VK или web-session; роль admin | Транзакционная модерация, смена статуса, назначения при approve, аудит и уведомление ученика | high | nest-ready |
| GET | `/api/admin/homeworks` | Telegram, VK или web-session; роль admin | Все либо отфильтрованные работы, проверки и вложения | high | nest-ready |
| GET | `/api/admin/audit` | Telegram, VK или web-session; роль admin | Аудит действий с лимитом 1–200 и raw JSON meta | medium | nest-ready |
| POST | `/api/admin/teachers` | Telegram, VK или web-session; роль admin | Назначение роли и профиля; при снятии — удаление роли и активных назначений без потери профиля и проверок | high | nest-ready |
| POST | `/api/admin/assign-student` | Telegram, VK или web-session; роль admin | Идемпотентное закрепление активного преподавателя за studying/completed-учеником, аудит и уведомления обеим сторонам; для уровня barber связь не создаётся | high | nest-ready |
| POST | `/api/admin/unassign-student` | Telegram, VK или web-session; роль admin | Идемпотентное снятие закрепления, аудит и уведомления обеим сторонам | high | nest-ready |

## Кабинет преподавателя

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/teacher/dashboard` | преподаватель — только назначенные активные ученики; администратор без teacher-профиля — все активные | Pending-работы и краткая статистика | medium | nest-ready |
| GET | `/api/teacher/student-homeworks` | назначенный преподаватель; администратор без teacher-профиля — любой активный ученик | Профиль, рейтинг, работы, проверки, комментарии и вложения; по умолчанию только pending | high | nest-ready |
| GET | `/api/teacher/students` | преподаватель — только назначенные активные ученики; администратор без teacher-профиля — все активные | Список учеников, преподаватели, рейтинг и число pending-работ | medium | nest-ready |

## Общие зависимости legacy

- Идентификация: `telegram_id` в query/body плюс Telegram, VK или web-session заголовки.
- Авторизация: `assertTelegramWebAppForClaimedId`, `requireAdmin`, `resolveTeacherScope` и локальные проверки.
- БД: синхронный `better-sqlite3`; API и Telegram-бот открывают один файл.
- Файлы: локальный `data/uploads` либо Telegram `file_id`.
- Побочные эффекты: Telegram Bot API, in-app уведомления, аудит, системные сообщения чата и feedback invites.
- Формат ответа: успешный `{ ok: true, data? }`, ошибка `{ ok: false, error }`.

## Правило переноса маршрута

Маршрут получает статус `nest`, только когда для него зафиксированы контракт, права, изменения БД и побочные эффекты; один набор тестов проходит против legacy и Nest; переключение можно откатить без отката данных.

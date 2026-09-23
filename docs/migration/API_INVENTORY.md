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
| POST | `/api/web-auth/start` | публичный | Одноразовый запрос входа, Telegram/VK handoff URL | high | legacy |
| GET | `/api/web-auth/status` | одноразовый токен | Polling подтверждения и выпуск web-session | high | legacy |
| POST | `/api/web-auth/confirm/vk` | подписанные VK launch params | Подтверждение VK-входа | high | legacy |
| POST | `/api/web-auth/logout` | web-session | Удаление сессии | medium | legacy |
| GET | `/api/web-auth/session` | web-session | Проверка сессии сайта | medium | legacy |
| POST | `/api/account/vk-link-token` | Telegram | Четырёхзначный код привязки | high | legacy |
| POST | `/api/account/vk-link-confirm` | VK | Связывание Telegram- и VK-идентичностей | high | legacy |

## Уведомления

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/notifications` | Telegram, VK или web-session с существующим user | Список, JSON payload, общее число непрочитанных и retention | medium | nest-ready |
| POST | `/api/notifications/read` | Telegram, VK или web-session с существующим user | Идемпотентно отметить одно своё или все свои уведомления прочитанными | medium | nest-ready |

## Чаты

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/chats/students` | пользователь чата | Доступные чаты учеников | high | covered |
| GET | `/api/chats/messages` | участник чата | История сообщений | high | legacy |
| POST | `/api/chats/messages` | участник чата | Multipart-сообщение, файл, уведомления | high | legacy |
| GET | `/api/chats/messages/:id/file` | участник чата | Локальный или Telegram-файл | high | legacy |

## Домашние задания и файлы

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/student/homeworks` | Telegram, VK или web-session с существующим student | Только свои работы, все проверки, комментарии, вложения и рейтинг по принятым оценкам | high | nest-ready |
| POST | `/api/homeworks` | ученик `studying` | Multipart до 5 файлов, защита от дубликата, уведомления | high | legacy |
| PATCH | `/api/student/homeworks/:homeworkId` | владелец pending-работы | Редактирование текста и вложений | high | legacy |
| POST | `/api/student/homeworks/:homeworkId/revision` | владелец revision-работы | Исправление и возврат в pending | high | legacy |
| POST | `/api/homeworks/:id/comments` | ученик, назначенный преподаватель или администратор | Комментарий и уведомления | high | legacy |
| POST | `/api/teacher/review` | назначенный преподаватель или администратор | Проверка, статус, рейтинг, чат, уведомления, feedback invite | high | legacy |
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
| POST | `/api/teacher/about` | преподаватель | Изменение `about_me` | medium | legacy |
| POST | `/api/student/profile-edit` | ученик `studying/completed` | Заявка на изменение профиля | high | legacy |
| POST | `/api/student/me/avatar` | Telegram, VK или web-session с существующим student | Multipart-загрузка, JPEG-нормализация и безопасная замена аватара | high | nest-ready |
| GET | `/api/student/me/avatar` | Telegram, VK или web-session с существующим student | Собственный локальный аватар с private cache | medium | nest-ready |
| GET | `/api/students/:student_id/avatar` | владелец, назначенный преподаватель или администратор | Ролевой доступ к локальному аватару с private cache | high | nest-ready |

## Регистрация и заявки преподавателей

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/students` | подтверждённая платформенная личность | Регистрация ученика и уведомление администраторов | high | legacy |
| POST | `/api/teacher-application` | подтверждённая платформенная личность | Заявка преподавателя | high | legacy |
| GET | `/api/admin/teacher-applications` | администратор | Необработанные заявки | medium | legacy |
| POST | `/api/admin/teacher-applications` | администратор | Принятие/отклонение, роль и профиль преподавателя | high | legacy |

## Конфиденциальная обратная связь

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/student/feedback` | ученик | Идемпотентная отправка по `request_key` | high | legacy |
| GET | `/api/admin/feedback` | администратор | Постраничное чтение отзывов | high | legacy |

## Администрирование профилей

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/profile-edits` | администратор | Необработанные заявки | medium | legacy |
| POST | `/api/admin/profile-edits/:id` | администратор | Принятие/отклонение, аудит, уведомление | high | legacy |

## Администрирование учеников и преподавателей

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/teachers` | администратор | Преподаватели и закреплённые ученики | medium | legacy |
| GET | `/api/admin/students` | администратор | Ученики по статусу, рейтинг и назначения | medium | covered |
| GET | `/api/admin/student/:student_id` | администратор | Полный профиль и работы | high | legacy |
| POST | `/api/admin/update-student` | администратор | Уровень, число занятий, полная замена назначений | high | legacy |
| POST | `/api/admin/students` | администратор | Модерация и смена статуса | high | legacy |
| GET | `/api/admin/homeworks` | администратор | Все работы и проверки | high | legacy |
| GET | `/api/admin/audit` | администратор | Аудит действий | medium | legacy |
| POST | `/api/admin/teachers` | администратор | Назначение или снятие роли преподавателя | high | legacy |
| POST | `/api/admin/assign-student` | администратор | Закрепление ученика | high | legacy |
| POST | `/api/admin/unassign-student` | администратор | Снятие закрепления | high | legacy |

## Кабинет преподавателя

| Метод | Путь | Доступ | Основная логика | Риск | Статус |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/teacher/dashboard` | преподаватель или администратор | Pending-работы и краткая статистика | medium | legacy |
| GET | `/api/teacher/student-homeworks` | назначенный преподаватель или администратор | Профиль и работы ученика | high | legacy |
| GET | `/api/teacher/students` | преподаватель или администратор | Список учеников и статистика | medium | legacy |

## Общие зависимости legacy

- Идентификация: `telegram_id` в query/body плюс Telegram, VK или web-session заголовки.
- Авторизация: `assertTelegramWebAppForClaimedId`, `requireAdmin`, `resolveTeacherScope` и локальные проверки.
- БД: синхронный `better-sqlite3`; API и Telegram-бот открывают один файл.
- Файлы: локальный `data/uploads` либо Telegram `file_id`.
- Побочные эффекты: Telegram Bot API, in-app уведомления, аудит, системные сообщения чата и feedback invites.
- Формат ответа: успешный `{ ok: true, data? }`, ошибка `{ ok: false, error }`.

## Правило переноса маршрута

Маршрут получает статус `nest`, только когда для него зафиксированы контракт, права, изменения БД и побочные эффекты; один набор тестов проходит против legacy и Nest; переключение можно откатить без отката данных.

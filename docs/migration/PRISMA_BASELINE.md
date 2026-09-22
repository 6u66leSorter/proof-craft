# Prisma baseline

## Назначение

Prisma 7.10 подключена к существующей SQLite как новый persistence adapter. Baseline не создаёт и не изменяет таблицы: `schema.prisma` получена интроспекцией временной БД, которую с нуля создал текущий `bot/database.js`.

## Зафиксированное состояние

- 19 физических таблиц.
- SQLite остаётся текущей СУБД.
- Физические имена моделей и полей сохранены без переименования.
- `created_at`, `updated_at` и другие legacy timestamps остаются `String`, потому что в SQLite это `TEXT`.
- `is_bonus` остаётся `Int`, потому что legacy хранит boolean как `0/1` с CHECK constraint.
- CHECK constraints Prisma не заменяет доменными правилами; они будут отражены в DTO/use cases при переносе маршрутов.
- Частичный уникальный индекс `users.vk_user_id` сохранён интроспекцией.
- Каталог `prisma/migrations` намеренно отсутствует.

## Runtime boundary

`PrismaService` инкапсулирует driver adapter и требует явный `DATABASE_URL=file:/absolute/path`. Controller не должен получать `PrismaService` напрямую. Первый boundary:

```text
controller/use case -> UserIdentityRepository -> PrismaUserIdentityRepository -> PrismaService
```

`AppModule` пока не импортирует persistence-модуль: `/health` не должен зависеть от доступности БД. Доменные модули будут подключать repository по мере переноса.

## Проверка drift

`backend/test/prisma-baseline.e2e.test.ts` при каждом запуске:

1. создаёт временную SQLite через legacy-миграции;
2. проверяет точный список 19 таблиц;
3. сравнивает их с моделями `schema.prisma`;
4. читает identity через repository;
5. удаляет временные данные.

Если `bot/database.js` изменится без актуализации Prisma schema, тест упадёт.

## Запрещённые действия до отдельного решения

- `prisma db push` на любой рабочей базе;
- `prisma migrate dev/deploy`;
- ручное редактирование production SQLite;
- автоматическое переименование таблиц или колонок;
- подключение Prisma напрямую из controller.

## Dependency audit

Runtime используется только с SQLite adapter. `npm audit` сообщает четыре high advisory в дереве Prisma CLI: `deepmerge-ts` и `mysql2`. Они приходят через dev CLI; MySQL в проекте не используется. Автоматический downgrade до Prisma 6 или переход на Prisma 8 RC не выполнялся. Перед production cutover нужно повторить audit и обновиться на стабильную исправленную версию.

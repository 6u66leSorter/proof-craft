# Новый фронтенд (в разработке)

Клиент на React 19 + TypeScript, перенесённый с legacy-клиента с сохранением вида «1 в 1». История переноса: `docs/migration/FRONTEND_PLAN.md`.

## Приложение

```bash
npm install
npm run dev         # http://localhost:5174, /api проксируется на NestJS API :8788
npm run typecheck
npm run build       # frontend/dist
```

- `src/platform/` — определение Telegram / VK / web-session, Telegram SDK, хранилище.
- `src/api/` — клиент legacy API и типы ответов.
- `src/app/` — стор (Zustand) со стеком экранов, `bootstrap`, корневой `App`.
- `src/screens/` — перенесённые экраны; остальные показывают заглушку.
- `src/ui/` — общие элементы (`Header`) и иконки, сгенерированные из legacy `ICO`.
- Стили — `src/styles/index.css` (перенесены из legacy без изменений, подключают `academy.css`) плюс `src/styles/legacy-compat.css`; статика — `public/`.
- `src/features/<раздел>/` — экраны раздела и их запросы (сейчас `guest`).

## Визуальные тесты

`visual/` — Playwright-тесты экранов и поведения. Эталоны в `visual/__screenshots__/` сняты с legacy-клиента и фиксируют паритет «1 в 1»; гостевая витрина переснята после исправления SEC-001 (считаются только одобренные работы).

```bash
npm install                    # в каталоге frontend/ (и npm install в backend/)
npx playwright install chromium
npm run visual:test            # сравнить с эталонами
npm run visual:update          # переснять изменившиеся эталоны (только осознанно)
node visual/tools/diff-report.mjs   # где именно расходятся снимки последнего прогона
```

- `visual/specs/*.visual.ts` — снимки экранов; `visual/specs/*.behavior.ts` — поведение (навигация, клавиатура, просмотр фото).
- `visual/api-stand/start.mjs` создаёт во временном каталоге SQLite из `backend/prisma/schema.sql`, заполняет её `seed.mjs` и запускает NestJS API на `127.0.0.1:18787` (`TG_WEBAPP_AUTH=strict`); каталог удаляется при остановке.
- Клиент собирается и отдаётся через `vite preview` на `127.0.0.1:14173`, `/api` проксируется на стенд.
- Вход — через web-session из `visual/api-stand/sessions.mjs` (admin, teacher, student, intern, moderation, newcomer) и `?guest=1`.
- Мутирующие `/api` запросы перехватываются в браузере и не доходят до БД; внешние скрипты заглушены, шрифты берутся из `@fontsource`, остальные внешние запросы блокируются.
- Сравнение строгое: `threshold: 0`, `maxDiffPixels: 0`, детерминированные флаги растеризации Chromium. Для прокручиваемых экранов снимается второй кадр `--full` с раскрытым `.scr`.
- `sharp` закреплён на 0.34.5: от его версии зависят пиксели сгенерированных фото сида.

Матрица: 4 проекта (`light`/`dark` × 390×844/360×800), 67 сценариев, 268 проверок.

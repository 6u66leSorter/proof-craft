# Новый фронтенд (в разработке)

Отдельный пакет для миграции клиента на React 19 + TypeScript. Legacy-клиент в `src/` не меняется и остаётся production до явного переключения. План и правила переноса: `docs/migration/FRONTEND_PLAN.md`.

## Приложение

```bash
npm install
npm run dev         # http://localhost:5174, /api проксируется на legacy API :8787
npm run typecheck
npm run build       # frontend/dist
```

- `src/platform/` — определение Telegram / VK / web-session, Telegram SDK, хранилище.
- `src/api/` — клиент legacy API и типы ответов.
- `src/app/` — стор (Zustand) со стеком экранов, `bootstrap`, корневой `App`.
- `src/screens/` — перенесённые экраны; остальные показывают заглушку.
- `src/ui/` — общие элементы (`Header`) и иконки, сгенерированные из legacy `ICO`.
- Стили — `../src/index.css` legacy-клиента без копирования плюс `src/styles/legacy-compat.css`; статика — корневой `public/`.
- `src/features/<раздел>/` — экраны раздела и их запросы (сейчас `guest`).

## Визуальный baseline

`visual/` — Playwright-тесты, которые снимают эталонные скриншоты legacy-клиента. Позже тот же набор принимает экраны нового клиента.

```bash
npm install                    # в каталоге frontend/
npx playwright install chromium
npm run visual:test            # сравнить с эталонами
npm run visual:update          # переснять эталоны (только осознанно)
npm run visual:test:next       # новый клиент против тех же эталонов
```

В режиме `next` проверяются только сценарии из `visual/ported.ts`; переснимать эталоны с нового клиента запрещено.

- `visual/specs/*.visual.ts` — снимки экранов; `visual/specs/*.behavior.ts` — поведение (навигация, клавиатура, просмотр фото), одинаковое для обоих клиентов.
- `node visual/tools/diff-report.mjs next` — где именно расходятся снимки последнего прогона.

Как устроено:

- `visual/legacy-api/start.mjs` копирует `bot/` во временный каталог, создаёт схему, заполняет её `seed.mjs` и запускает legacy API на `127.0.0.1:18787` в режиме `TG_WEBAPP_AUTH=strict`. Рабочие `data/` и `bot/` не затрагиваются; временный каталог удаляется при остановке.
- `visual/vite.legacy.config.mjs` собирает legacy-клиент в `visual/.legacy-dist` и отдаёт его через `vite preview` на `127.0.0.1:14173`. Корневые `vite.config.js`, `dist/` и `.env` не используются.
- Вход — через web-session из `visual/legacy-api/sessions.mjs` (admin, teacher, student, intern, moderation, newcomer) и `?guest=1`.
- Мутирующие `/api` запросы перехватываются в браузере и не доходят до БД; внешние скрипты заглушены, шрифты берутся из `@fontsource`, остальные внешние запросы блокируются.
- Сравнение строгое: `threshold: 0`, `maxDiffPixels: 0`, детерминированные флаги растеризации Chromium. Для прокручиваемых экранов снимается второй кадр `--full` с раскрытым `.scr`.
- Сценарии кликают по видимому тексту и ролям, а не по `window.__ba_*`, поэтому применимы и к новому клиенту.

Матрица: 4 проекта (`light`/`dark` × 390×844/360×800), 24 сценария, 228 эталонов в `visual/__screenshots__/`.

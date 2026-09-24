import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test as base, expect, type Page } from '@playwright/test'
import { VISUAL_SESSIONS } from './legacy-api/sessions.mjs'
import { PORTED_SCENARIOS } from './ported'

export type Theme = 'light' | 'dark'
export type Role = keyof typeof VISUAL_SESSIONS
export type VisualOptions = { theme: Theme }

const require = createRequire(import.meta.url)

/** Те же начертания, что запрашивает index.html у Google Fonts, но из локальных файлов. */
const FONT_FACES = [
  ['Playfair Display', 'playfair-display', [400, 600, 700]],
  ['Nunito Sans', 'nunito-sans', [300, 400, 600, 700]],
] as const
const fontFile = (pkg: string, subset: string, weight: number) =>
  require.resolve(`@fontsource/${pkg}/files/${pkg}-${subset}-${weight}-normal.woff2`)

const fontsCss = FONT_FACES.flatMap(([family, pkg, weights]) =>
  weights.flatMap((weight) =>
    (['cyrillic', 'latin'] as const).map(
      (subset) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;` +
        `src:url(https://fonts.gstatic.com/visual/${pkg}/${subset}/${weight}.woff2) format('woff2');` +
        `unicode-range:${subset === 'cyrillic' ? 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' : 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'}}`,
    ),
  ),
).join('\n')

/** Фиксированный момент «сейчас» совпадает с датами сида. */
const FIXED_NOW = new Date('2030-03-15T12:00:00+03:00')

type SettleOptions = { waitForNetwork?: boolean }

export type Mutation = { method: string; path: string; body: unknown }

type VisualFixtures = {
  portedGuard: void
  mutations: Mutation[]
  openAs: (role: Role | null, search?: string, options?: SettleOptions) => Promise<void>
  settle: () => Promise<void>
  snap: (name: string, options?: SettleOptions) => Promise<void>
}

export const test = base.extend<VisualFixtures & VisualOptions>({
  theme: ['light', { option: true }],

  portedGuard: [
    async ({}, use, testInfo) => {
      if (process.env.VISUAL_TARGET === 'next') {
        const scenario = testInfo.titlePath.slice(1).join(' › ')
        testInfo.skip(!PORTED_SCENARIOS.has(scenario), 'экран ещё не перенесён в новый клиент')
      }
      await use()
    },
    { auto: true },
  ],

  mutations: async ({ page, baseURL }, use) => {
    const mutations: Mutation[] = []
    await page.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === new URL(baseURL!).origin) {
        if (url.pathname.startsWith('/api/') && request.method() !== 'GET') {
          // Тесты не меняют общую БД: мутации фиксируются и получают нейтральный ответ.
          let body: unknown = request.postData()
          try {
            body = request.postDataJSON()
          } catch {
            // не JSON (multipart) — сохраняем как есть
          }
          mutations.push({ method: request.method(), path: url.pathname, body })
          return route.fulfill({ json: { ok: true, data: {} } })
        }
        return route.continue()
      }
      if (url.hostname === 'fonts.googleapis.com') {
        return route.fulfill({ contentType: 'text/css', body: fontsCss })
      }
      if (url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/visual/')) {
        const [, , pkg, subset, file] = url.pathname.split('/')
        return route.fulfill({ contentType: 'font/woff2', body: readFileSync(fontFile(pkg, subset, parseInt(file, 10))) })
      }
      if (url.hostname === 'telegram.org' || url.hostname === 'unpkg.com') {
        // Обычный браузер: Telegram SDK и vk-bridge не нужны, клиент должен работать без них.
        return route.fulfill({ contentType: 'application/javascript', body: '' })
      }
      return route.abort()
    })
    await use(mutations)
  },

  openAs: async ({ page, theme, mutations }, use) => {
    void mutations
    await page.clock.setFixedTime(FIXED_NOW)
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme })
    await use(async (role, search = '', options = {}) => {
      const token = role ? VISUAL_SESSIONS[role] : null
      await page.addInitScript(
        ({ theme, token }) => {
          try {
            // Только при первом открытии вкладки: перезагрузка должна видеть состояние, оставленное приложением.
            if (sessionStorage.getItem('__visual_ready')) return
            localStorage.setItem('ba_theme', theme)
            if (token) localStorage.setItem('ba_web_session', token)
            else localStorage.removeItem('ba_web_session')
            sessionStorage.clear()
            sessionStorage.setItem('__visual_ready', '1')
          } catch {
            // storage недоступен — тест упадёт на снимке и покажет причину
          }
        },
        { theme, token },
      )
      await page.goto(`/${search}`)
      await settlePage(page, options)
    })
  },

  settle: async ({ page }, use) => {
    await use(() => settlePage(page))
  },

  snap: async ({ page }, use) => {
    await use(async (name, options = {}) => {
      // Указатель остаётся там, где был последний клик, и даёт :hover на случайных элементах.
      await page.mouse.move(0, 0)
      await settlePage(page, options)
      await expect(page).toHaveScreenshot(`${name}.png`)
      // Второй снимок раскрывает внутренний скролл `.scr`, чтобы сравнивать и содержимое ниже экрана.
      const expanded = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('#app .scr')
        if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return false
        document.documentElement.dataset.visualExpanded = '1'
        const style = document.createElement('style')
        style.id = 'visual-expand'
        style.textContent =
          'html,body{height:auto!important;overflow:visible!important}' +
          '#app{height:auto!important;overflow:visible!important}' +
          '#app .scr{flex:none!important;overflow:visible!important;height:auto!important}'
        document.head.appendChild(style)
        return true
      })
      if (expanded) {
        await expect(page).toHaveScreenshot(`${name}--full.png`, { fullPage: true })
        await page.evaluate(() => {
          document.getElementById('visual-expand')?.remove()
          delete document.documentElement.dataset.visualExpanded
        })
      }
    })
  },
})

async function settlePage(page: Page, { waitForNetwork = true }: SettleOptions = {}) {
  if (waitForNetwork) await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    await document.fonts.ready
    const pending = Array.from(document.images).filter((img) => img.getAttribute('src') && !img.complete)
    await Promise.all(pending.map((img) => new Promise((resolve) => { img.onload = img.onerror = resolve })))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  // Аватары и фото подгружаются через fetch → blob после рендера; ждём, пока все получат src.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('img[data-auth-src]')).every((img) => img.getAttribute('src')?.startsWith('blob:') && img.complete),
  )
}

export { expect }

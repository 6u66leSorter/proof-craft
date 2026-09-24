import { expect, test } from '../fixtures'

test.describe('вход и регистрация', () => {
  test('вход на сайт без сессии', async ({ openAs, snap, page }) => {
    await openAs(null)
    await expect(page.getByText('Telegram').first()).toBeVisible()
    await snap('auth-web-login')
  })

  test('ожидание подтверждения входа', async ({ openAs, snap, page, context }) => {
    await page.route('**/api/web-auth/start', (route) =>
      route.fulfill({ json: { ok: true, data: { token: 'visual-login-token', handoff_url: 'about:blank', expires_in_seconds: 900 } } }),
    )
    await page.route('**/api/web-auth/status?*', (route) => route.fulfill({ json: { ok: true, data: { status: 'pending' } } }))
    await openAs(null)
    const popup = context.waitForEvent('page')
    await page.getByRole('button', { name: 'Войти через Telegram' }).click()
    await (await popup).close()
    await expect(page.getByText('Подтвердите вход в Telegram')).toBeVisible()
    await snap('auth-web-login-waiting', { waitForNetwork: false })
  })

  test('выбор роли для нового пользователя', async ({ openAs, snap }) => {
    await openAs('newcomer')
    await snap('auth-register-role')
  })

  test('регистрация ученика', async ({ openAs, snap, page }) => {
    await openAs('newcomer')
    await page.getByText('Ученик', { exact: true }).click()
    await snap('auth-register-student')
    await page.getByRole('button', { name: 'Вход', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Проверить снова' })).toBeVisible()
    await snap('auth-register-login-tab')
  })

  test('заявка преподавателя', async ({ openAs, snap, page }) => {
    await openAs('newcomer')
    await page.getByText('Преподаватель', { exact: true }).click()
    await snap('auth-register-teacher')
    await page.getByRole('textbox', { name: 'Имя *' }).fill('Олег')
    await page.getByRole('textbox', { name: 'Фамилия *' }).fill('Новый')
    await page.getByRole('textbox', { name: 'Телефон *' }).fill('+79990001122')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await expect(page.getByText('Заявка отправлена!')).toBeVisible()
    await page.locator('.toast').waitFor({ state: 'detached' })
    await snap('auth-register-teacher-sent')
  })

  test('вход администратора без прав', async ({ openAs, snap, page }) => {
    await openAs('newcomer')
    await page.getByText('Администратор', { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Проверить снова' })).toBeVisible()
    await snap('auth-register-admin')
  })

  test('экран ошибки загрузки сессии', async ({ openAs, snap, page }) => {
    await page.route('**/api/session?*', (route) =>
      route.fulfill({ status: 500, json: { ok: false, error: 'Сервер временно недоступен' } }),
    )
    await openAs('student')
    await expect(page.getByText('Сервер временно недоступен')).toBeVisible()
    await snap('app-error')
  })

  test('экран загрузки профиля', async ({ openAs, snap, page }) => {
    await page.route('**/api/session?*', () => new Promise(() => {}))
    await openAs('student', '', { waitForNetwork: false })
    await expect(page.getByText('Загружаем профиль')).toBeVisible()
    await snap('app-loading', { waitForNetwork: false })
  })
})

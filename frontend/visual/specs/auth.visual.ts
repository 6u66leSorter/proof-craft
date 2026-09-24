import { expect, test } from '../fixtures'

test.describe('вход и регистрация', () => {
  test('вход на сайт без сессии', async ({ openAs, snap, page }) => {
    await openAs(null)
    await expect(page.getByText('Telegram').first()).toBeVisible()
    await snap('auth-web-login')
  })

  test('выбор роли для нового пользователя', async ({ openAs, snap }) => {
    await openAs('newcomer')
    await snap('auth-register-role')
  })

  test('регистрация ученика', async ({ openAs, snap, page }) => {
    await openAs('newcomer')
    await page.getByText('Ученик', { exact: true }).click()
    await snap('auth-register-student')
  })

  test('заявка преподавателя', async ({ openAs, snap, page }) => {
    await openAs('newcomer')
    await page.getByText('Преподаватель', { exact: true }).click()
    await snap('auth-register-teacher')
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

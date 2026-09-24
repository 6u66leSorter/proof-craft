import { expect, test } from '../fixtures'

test.describe('вход и регистрация: поведение', () => {
  test('анкета ученика проверяет поля и отправляет заявку', async ({ openAs, page, mutations }) => {
    await openAs('newcomer')
    await page.getByText('Ученик', { exact: true }).click()
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await expect(page.locator('.toast')).toHaveText('Заполните обязательные поля')
    expect(mutations).toEqual([])

    await page.getByRole('textbox', { name: 'Имя *' }).fill(' Никита ')
    await page.getByRole('textbox', { name: 'Фамилия *' }).fill('Новиков')
    await page.getByRole('textbox', { name: 'Телефон *' }).fill('+79990001100')
    await page.getByRole('textbox', { name: 'Станция метро' }).fill('Сокол')
    await page.getByRole('textbox', { name: 'Количество занятий *' }).fill('12')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await expect(page.getByText('Выберите роль')).toBeVisible()
    expect(mutations).toEqual([
      {
        method: 'POST',
        path: '/api/students',
        body: {
          telegram_id: 4001,
          full_name: 'Никита Новиков',
          phone: '+79990001100',
          lessons_count: '12',
          first_name: 'Никита',
          last_name: 'Новиков',
          metro: 'Сокол',
        },
      },
    ])
  })

  test('заявка преподавателя уходит с именем и телефоном', async ({ openAs, page, mutations }) => {
    await openAs('newcomer')
    await page.getByText('Преподаватель', { exact: true }).click()
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await expect(page.locator('.toast')).toHaveText('Заполните все поля')
    await page.getByRole('textbox', { name: 'Имя *' }).fill('Олег')
    await page.getByRole('textbox', { name: 'Фамилия *' }).fill('Новый')
    await page.getByRole('textbox', { name: 'Телефон *' }).fill('+79990001122')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await expect(page.getByText('Заявка отправлена!')).toBeVisible()
    expect(mutations).toEqual([
      { method: 'POST', path: '/api/teacher-application', body: { telegram_id: 4001, full_name: 'Олег Новый', phone: '+79990001122' } },
    ])
    await page.getByRole('button', { name: 'Назад', exact: true }).last().click()
    await expect(page.getByText('Выберите роль')).toBeVisible()
  })

  test('роль «Гость» открывает витрину и переживает перезагрузку', async ({ openAs, settle, page }) => {
    await openAs('newcomer')
    await page.getByText('Гость', { exact: true }).click()
    await expect(page.getByRole('heading', { name: /Работы наших/ })).toBeVisible()
    await page.reload()
    await settle()
    await expect(page.getByRole('heading', { name: /Работы наших/ })).toBeVisible()
    await page.getByRole('button', { name: 'Выйти' }).click()
    await expect(page.getByText('Выберите роль')).toBeVisible()
  })

  test('ожидание входа можно отменить', async ({ openAs, page, context }) => {
    await page.route('**/api/web-auth/start', (route) =>
      route.fulfill({ json: { ok: true, data: { token: 'visual-login-token', handoff_url: 'about:blank', expires_in_seconds: 900 } } }),
    )
    await page.route('**/api/web-auth/status?*', (route) => route.fulfill({ json: { ok: true, data: { status: 'pending' } } }))
    await openAs(null)
    const popup = context.waitForEvent('page')
    await page.getByRole('button', { name: 'Войти через VK' }).click()
    await (await popup).close()
    await expect(page.getByText('Подтвердите вход в VK')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Войти через Telegram' })).toBeDisabled()
    await page.getByRole('button', { name: 'Отменить' }).click()
    await expect(page.getByRole('button', { name: 'Войти через Telegram' })).toBeEnabled()
    await expect(page.getByText('Подтвердите вход')).toBeHidden()
  })

  test('подтверждённый вход сохраняет web-сессию и открывает дневник', async ({ openAs, page, context }) => {
    await page.route('**/api/web-auth/start', (route) =>
      route.fulfill({ json: { ok: true, data: { token: 'visual-login-token', handoff_url: 'about:blank', expires_in_seconds: 900 } } }),
    )
    await page.route('**/api/web-auth/status?*', (route) =>
      route.fulfill({ json: { ok: true, data: { status: 'approved', session_token: 'visual-teacher-session' } } }),
    )
    await openAs(null)
    const popup = context.waitForEvent('page')
    await page.getByRole('button', { name: 'Войти через Telegram' }).click()
    await (await popup).close()
    await expect(page.getByText('Дневник академии')).toBeHidden({ timeout: 10_000 })
    expect(await page.evaluate(() => localStorage.getItem('ba_web_session'))).toBe('visual-teacher-session')
  })

  test('выход из витрины по ссылке ?guest=1 ведёт на вход', async ({ openAs, page }) => {
    await openAs(null, '?guest=1')
    await page.getByRole('button', { name: 'Выйти' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Войти через Telegram' })).toBeVisible()
  })
})

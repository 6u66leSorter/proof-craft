import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'

const tab = (page: Page, name: string) => page.locator('.tb', { hasText: name }).click()

test.describe('ученик: поведение', () => {
  test.beforeEach(async ({ openAs }) => {
    await openAs('student')
  })

  test('вкладка уведомлений помечает всё прочитанным', async ({ page, settle, mutations }) => {
    await tab(page, 'Увед.')
    await settle()
    await expect(page.getByText('Урок 3 отправлен на доработку')).toBeVisible()
    expect(mutations).toEqual([{ method: 'POST', path: '/api/notifications/read', body: { telegram_id: 3001, read_all: true } }])
  })

  test('заявка на изменение профиля проверяет поля и уходит администратору', async ({ page, mutations }) => {
    await page.getByRole('button', { name: 'Редактировать профиль' }).click()
    await expect(page.getByRole('textbox', { name: 'Имя *' })).toHaveValue('Анна')
    await expect(page.getByRole('textbox', { name: 'Фамилия *' })).toHaveValue('Смирнова')
    await page.getByRole('textbox', { name: 'Телефон *' }).fill('')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await expect(page.getByText('Заполните обязательные поля (имя, фамилия, телефон).')).toBeVisible()
    await page.getByRole('textbox', { name: 'Телефон *' }).fill('+79990000077')
    await page.getByRole('textbox', { name: 'Станция метро' }).fill('')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await expect(page.locator('.toast')).toHaveText('Заявка отправлена, ожидайте одобрения')
    await expect(page.getByText('Изменения вступят в силу')).toBeHidden()
    expect(mutations).toEqual([
      { method: 'POST', path: '/api/student/profile-edit', body: { telegram_id: 3001, full_name: 'Анна Смирнова', phone: '+79990000077' } },
    ])
  })

  test('модалка профиля закрывается крестиком и по фону', async ({ page }) => {
    await page.getByRole('button', { name: 'Редактировать профиль' }).click()
    await page.getByRole('button', { name: '×' }).click()
    await expect(page.getByText('Изменения вступят в силу')).toBeHidden()
    await page.getByRole('button', { name: 'Редактировать профиль' }).click()
    await page.mouse.click(10, 10)
    await expect(page.getByText('Изменения вступят в силу')).toBeHidden()
  })

  test('раздел «Обо мне» сохраняется', async ({ page, mutations }) => {
    await tab(page, 'Профиль')
    await page.getByRole('textbox', { name: 'Расскажите немного о себе…' }).fill('  Люблю классику  ')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.locator('.toast')).toHaveText('Сохранено')
    expect(mutations).toEqual([{ method: 'POST', path: '/api/student/about', body: { telegram_id: 3001, about_me: 'Люблю классику' } }])
    await tab(page, 'Главная')
    await expect(page.getByText('Люблю классику')).toBeVisible()
  })

  test('отзыв администратору требует текст и отправляется один раз', async ({ page, mutations }) => {
    await page.getByRole('button', { name: 'Обратная связь об обучении' }).click()
    await page.getByRole('button', { name: 'Отправить администратору' }).click()
    await expect(page.getByRole('alert')).toHaveText('Напишите сообщение перед отправкой.')
    await page.getByLabel('О чём сообщение').selectOption('academy')
    await page.getByLabel('Ваши пожелания').fill('Больше практики')
    await page.getByRole('button', { name: 'Отправить администратору' }).click()
    await expect(page.getByRole('status')).toHaveText('Спасибо! Ваш отзыв отправлен администратору.')
    expect(mutations).toEqual([
      {
        method: 'POST',
        path: '/api/student/feedback',
        body: { telegram_id: 3001, subject: 'academy', message: 'Больше практики', request_key: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      },
    ])
    await page.getByRole('button', { name: 'Написать ещё' }).click()
    await expect(page.getByLabel('Ваши пожелания')).toHaveValue('')
    await page.getByRole('button', { name: 'Назад' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Анна Смирнова' })).toBeVisible()
  })

  test('сообщение в чат уходит по Enter', async ({ page, mutations }) => {
    await tab(page, 'Чат')
    // Legacy перерисовывает экран после загрузки ленты и теряет текст, набранный до неё.
    await expect(page.getByText('Отличный референс')).toBeVisible()
    const input = page.getByRole('textbox', { name: 'Сообщение...' })
    await input.fill('Когда следующее занятие?')
    await input.press('Enter')
    await expect(input).toHaveValue('')
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations[0].method).toBe('POST')
    expect(mutations[0].path).toBe('/api/chats/messages')
    expect(String(mutations[0].body)).toContain('Когда следующее занятие?')
  })

  test('кнопка чата в карточке преподавателя открывает вкладку чата', async ({ page }) => {
    await page.getByRole('button', { name: 'Открыть карточку' }).click()
    await expect(page.locator('.hdr h2')).toHaveText('Чат')
    await expect(page.locator('.tb.on')).toHaveText('Чат')
  })

  test('тема переключается и запоминается', async ({ page }) => {
    await page.getByRole('button', { name: 'Сменить светлую и тёмную тему' }).click()
    const theme = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(await page.evaluate(() => localStorage.getItem('ba_theme'))).toBe(theme)
    await page.reload()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
  })
})

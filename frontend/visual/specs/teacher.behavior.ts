import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'

const tab = (page: Page, name: string) => page.locator('.tb', { hasText: name }).click()
const openPendingWork = async (page: Page) => {
  await tab(page, 'Ученики')
  await page.locator('.card', { hasText: 'Анна Смирнова' }).first().click()
  await page.locator('.card', { hasText: 'Борода' }).last().click()
  await expect(page.getByText('Оформление бороды.')).toBeVisible()
}

test.describe('преподаватель: поведение', () => {
  test.beforeEach(async ({ openAs }) => {
    await openAs('teacher')
  })

  test('поиск: категории, Escape и Enter по единственному ученику', async ({ page }) => {
    await tab(page, 'Ученики')
    await page.getByRole('button', { name: 'Найти ученика' }).click()
    const input = page.getByRole('searchbox', { name: 'Имя или фамилия ученика' })
    await expect(input).toBeFocused()
    await page.getByRole('button', { name: /^Стажёр/ }).click()
    await expect(page.getByText('Найдено: 1 из 1')).toBeVisible()
    await input.fill('анн')
    await expect(page.getByText('Найдено: 0 из 1')).toBeVisible()
    await input.press('Escape')
    await expect(input).toHaveValue('')
    await input.fill('ВОЛК')
    await input.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Максим Волков' })).toBeVisible()
  })

  test('оценка звёздами и комментарий без оценки', async ({ page, mutations }) => {
    await openPendingWork(page)
    const submit = page.locator('#hw-submit-btn')
    await expect(submit).toBeDisabled()
    await page.locator('#hw-star-4').click()
    await expect(submit).toBeEnabled()
    await expect(submit).toHaveText('Принять')
    await page.locator('#hw-star-4').click()
    await expect(submit).toBeDisabled()
    await page.getByRole('textbox', { name: /Комментарий \(обязателен/ }).fill('Подровняйте контур')
    await expect(submit).toHaveText('Отправить комментарий')
    await submit.click()
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations[0]).toEqual({
      method: 'POST',
      path: '/api/teacher/review',
      body: { telegram_id: 2001, homework_id: 4, comment: 'Подровняйте контур' },
    })
  })

  test('принятие работы с оценкой', async ({ page, mutations }) => {
    await openPendingWork(page)
    await page.locator('#hw-star-5').click()
    await page.locator('#hw-submit-btn').click()
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations[0].body).toEqual({ telegram_id: 2001, homework_id: 4, rating: 5 })
  })

  test('раздел «Обо мне» преподавателя сохраняется', async ({ page, mutations }) => {
    const about = page.getByRole('textbox', { name: 'Расскажите ученикам о себе…' })
    await expect(about).toHaveValue(/восьмилетним стажем/)
    await about.fill(' Новый текст ')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.locator('.toast')).toHaveText('Сохранено')
    expect(mutations).toEqual([{ method: 'POST', path: '/api/teacher/about', body: { telegram_id: 2001, about_me: 'Новый текст' } }])
  })

  test('уведомление открывает работу ученика', async ({ page, settle }) => {
    await tab(page, 'Увед.')
    await settle()
    await page.locator('.card', { hasText: 'Анна Смирнова отправила урок 4' }).click()
    await expect(page.locator('.hdr h2')).toHaveText('ДЗ #4')
    await expect(page.getByText('Оформление бороды.')).toBeVisible()
  })

  test('сообщение ученику из чата', async ({ page, mutations }) => {
    await tab(page, 'Ученики')
    await page.locator('.card', { hasText: 'Анна Смирнова' }).first().click()
    await page.getByRole('button', { name: /Чат с учеником/ }).click()
    await expect(page.locator('.hdr h2')).toHaveText('Чат · Анна Смирнова')
    await expect(page.getByText('Отличный референс')).toBeVisible()
    const input = page.getByRole('textbox', { name: 'Сообщение...' })
    await input.fill('Жду фото')
    await page.getByRole('button', { name: 'Открыть чат' }).click()
    await expect.poll(() => mutations.length).toBe(1)
    expect(String(mutations[0].body)).toContain('name="student_id"\r\n\r\n1\r\n')
    expect(String(mutations[0].body)).toContain('Жду фото')
  })
})

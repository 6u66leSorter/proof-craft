import { expect, test } from '../fixtures'

test.describe('гостевая витрина: поведение', () => {
  test('навигация вперёд и назад сохраняет выбранную категорию', async ({ openAs, settle, page }) => {
    await openAs(null, '?guest=1')
    await page.getByRole('button', { name: /^Стажёр/ }).click()
    await expect(page.getByRole('button', { name: /^Стажёр/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /^Ученик/ }).click()
    await page.locator('article.card', { hasText: 'Анна Смирнова' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Анна Смирнова' })).toBeVisible()
    await page.getByRole('button', { name: /^Фейд/ }).click()
    await expect(page.locator('.hdr h2')).toHaveText('Работа')
    await page.getByRole('button', { name: 'Назад' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Анна Смирнова' })).toBeVisible()
    await page.getByRole('button', { name: 'Назад' }).click()
    await settle()
    await expect(page.getByRole('button', { name: /^Ученик/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: /Работы наших/ })).toBeVisible()
  })

  test('карточка ученика открывается с клавиатуры', async ({ openAs, page }) => {
    await openAs(null, '?guest=1')
    await page.locator('article.card', { hasText: 'Анна Смирнова' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Анна Смирнова' })).toBeVisible()
  })

  test('просмотр фото листается и закрывается', async ({ openAs, settle, page }) => {
    await openAs(null, '?guest=1')
    await page.locator('article.card', { hasText: 'Анна Смирнова' }).click()
    await page.getByRole('button', { name: /^Фейд/ }).click()
    await settle()
    await page.getByAltText('Фото 2').click()
    const dialog = page.getByRole('dialog', { name: 'Просмотр фотографии' })
    await expect(dialog).toContainText('2 / 3')
    await page.keyboard.press('ArrowRight')
    await expect(dialog).toContainText('3 / 3')
    await page.getByRole('button', { name: 'Следующее фото' }).click()
    await expect(dialog).toContainText('1 / 3')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('выход из витрины по ссылке ?guest=1 ведёт на вход', async ({ openAs, page }) => {
    await openAs(null, '?guest=1')
    await page.getByRole('button', { name: 'Выйти' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Telegram').first()).toBeVisible()
  })
})

import { expect, test } from '../fixtures'

test.describe('гостевая витрина', () => {
  test.beforeEach(async ({ openAs }) => {
    await openAs(null, '?guest=1')
  })

  test('портфолио учеников', async ({ snap }) => {
    await snap('guest-portfolio')
  })

  test('фильтр стажёров и барберов', async ({ snap, page }) => {
    await page.getByRole('button', { name: /^Стажёр/ }).click()
    await snap('guest-portfolio-intern')
    await page.getByRole('button', { name: /^Барбер/ }).click()
    await snap('guest-portfolio-barber')
  })

  test('портфолио ученика и работа', async ({ snap, page }) => {
    await page.locator('article.card', { hasText: 'Анна Смирнова' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Анна Смирнова' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Фейд/ })).toBeVisible()
    await snap('guest-student')
    await page.getByRole('button', { name: /^Фейд/ }).click()
    await expect(page.locator('.hdr h2')).toHaveText('Работа')
    await snap('guest-homework')
  })
})

import { expect, test } from '../fixtures'
import type { Page } from '@playwright/test'

const tab = (page: Page, name: string) => page.locator('.tb', { hasText: name }).click()

test.describe('администратор', () => {
  test.beforeEach(async ({ openAs }) => {
    await openAs('admin')
  })

  test('вкладки', async ({ snap, page }) => {
    await snap('admin-pending')
    await tab(page, 'Отзывы')
    await expect(page.getByText('Хотелось бы больше практики')).toBeVisible()
    await snap('admin-feedback')
    await tab(page, 'Ученики')
    await snap('admin-students')
    await tab(page, 'Преп.')
    await snap('admin-teachers')
    await tab(page, 'Увед.')
    await snap('admin-notifications')
  })

  test('настройка ученика в списке', async ({ snap, page }) => {
    await tab(page, 'Ученики')
    await page.getByRole('button', { name: /Настроить/ }).first().click()
    await snap('admin-student-inline-edit')
  })

  test('настройка ученика: категория «Барбер»', async ({ snap, page }) => {
    await tab(page, 'Ученики')
    await page.getByRole('button', { name: /Настроить/ }).first().click()
    await page.getByLabel('Категория ученика').first().selectOption('barber')
    await expect(page.getByText('После сохранения барбер будет откреплён').first()).toBeVisible()
    await snap('admin-student-inline-barber')
  })

  test('карточка ученика и чат', async ({ snap, page }) => {
    await tab(page, 'Ученики')
    await page.getByRole('button', { name: 'Открыть карточку' }).first().click()
    await expect(page.getByRole('button', { name: /Чат/ }).first()).toBeVisible()
    await snap('admin-student-profile')
    await page.getByRole('button', { name: /Чат/ }).first().click()
    await snap('admin-chat')
  })

  test('карточка преподавателя', async ({ snap, page }) => {
    await tab(page, 'Преп.')
    await page.locator('.card', { hasText: 'Ирина Соколова' }).first().click()
    await expect(page.locator('.hdr h2')).toHaveText('Ирина Соколова')
    await snap('admin-teacher')
  })
})

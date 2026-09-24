import { expect, test } from '../fixtures'
import type { Page } from '@playwright/test'

const tab = (page: Page, name: string) => page.locator('.tb', { hasText: name }).click()

test.describe('преподаватель', () => {
  test.beforeEach(async ({ openAs }) => {
    await openAs('teacher')
  })

  test('вкладки', async ({ snap, page }) => {
    await snap('teacher-profile')
    await tab(page, 'Проверить')
    await snap('teacher-review')
    await tab(page, 'Ученики')
    await snap('teacher-students')
    await tab(page, 'Увед.')
    await snap('teacher-notifications')
  })

  test('поиск учеников', async ({ snap, page }) => {
    await tab(page, 'Ученики')
    await page.getByRole('button', { name: 'Найти ученика' }).click()
    await page.getByRole('searchbox', { name: 'Имя или фамилия ученика' }).fill('анна')
    await expect(page.getByText('Найдено: 1 из 1')).toBeVisible()
    await snap('teacher-students-search')
    await page.getByRole('button', { name: /^Стажёр/ }).click()
    await expect(page.getByText('В этой категории никого не нашли')).toBeVisible()
    await snap('teacher-students-search-empty')
  })

  test('ученик, его работа и чат', async ({ snap, page }) => {
    await tab(page, 'Ученики')
    await page.locator('.card', { hasText: 'Анна Смирнова' }).first().click()
    await expect(page.getByRole('button', { name: /Чат с учеником/ })).toBeVisible()
    await snap('teacher-student')
    await page.locator('.card', { hasText: 'Борода' }).last().click()
    await expect(page.getByText('Оформление бороды.')).toBeVisible()
    await snap('teacher-homework-grade')
    await page.locator('.hdr .hdr-btn').first().click()
    await page.getByRole('button', { name: /Чат с учеником/ }).click()
    await expect(page.getByText('Отличный референс')).toBeVisible()
    await snap('teacher-chat')
  })
})

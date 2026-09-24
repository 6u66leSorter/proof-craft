import { expect, test } from '../fixtures'
import type { Page } from '@playwright/test'

const tab = (page: Page, name: string) => page.locator('.tb', { hasText: name }).click()
const openWork = async (page: Page, title: string) => {
  await tab(page, 'Работы')
  await page.locator('.card', { hasText: title }).last().click()
  await expect(page.locator('.hdr h2')).not.toHaveText('Мои работы')
}

test.describe('ученик', () => {
  test.beforeEach(async ({ openAs }) => {
    await openAs('student')
  })

  test('вкладки', async ({ snap, page }) => {
    await snap('student-home')
    await tab(page, 'Работы')
    await snap('student-works')
    await tab(page, 'Чат')
    await expect(page.getByText('Отличный референс')).toBeVisible()
    await snap('student-chat')
    await tab(page, 'Увед.')
    await snap('student-notifications')
    await tab(page, 'Профиль')
    await snap('student-profile')
  })

  test('принятая работа и просмотр фото', async ({ snap, page }) => {
    await openWork(page, 'Фейд')
    await expect(page.getByText('Попробуйте с насадкой')).toBeVisible()
    await snap('student-homework-approved')
    await page.getByAltText('Фото 1').click()
    await snap('student-homework-lightbox')
  })

  test('работа на доработке', async ({ snap, page }) => {
    await openWork(page, 'Андеркат')
    await snap('student-homework-revision')
  })

  test('работа на проверке и её редактирование', async ({ snap, page }) => {
    await openWork(page, 'Борода')
    await snap('student-homework-pending')
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
    await snap('student-homework-edit')
  })

  test('новое задание', async ({ snap, page }) => {
    await page.getByRole('button', { name: /ДЗ/ }).first().click()
    await expect(page.locator('.hdr h2')).toHaveText('Новое задание')
    await snap('student-homework-new')
  })

  test('заявка на изменение профиля', async ({ snap, page }) => {
    await page.getByRole('button', { name: 'Редактировать профиль' }).click()
    await snap('student-profile-edit')
  })

  test('обратная связь', async ({ snap, page }) => {
    await page.getByRole('button', { name: 'Обратная связь об обучении' }).click()
    await expect(page.locator('.hdr h2')).toHaveText('Обратная связь')
    await snap('student-feedback')
  })
})

test('ученик на модерации', async ({ openAs, snap }) => {
  await openAs('moderation')
  await snap('student-moderation-home')
})

test('стажёр', async ({ openAs, snap }) => {
  await openAs('intern')
  await snap('intern-home')
})

import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'

const tab = (page: Page, name: string) => page.locator('.tb', { hasText: name }).click()
const pendingCard = (page: Page, name: string) => page.locator('.pending-card', { hasText: name })

test.describe('администратор: поведение', () => {
  test.beforeEach(async ({ openAs }) => {
    await openAs('admin')
  })

  test('одобрение ученика с выбранным преподавателем', async ({ page, mutations }) => {
    const card = pendingCard(page, 'Ольга Петрова')
    await card.locator('label.tcb', { hasText: 'Ирина Соколова' }).click()
    await card.getByRole('button', { name: 'Одобрить' }).click()
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations[0]).toEqual({
      method: 'POST',
      path: '/api/admin/students',
      body: { telegram_id: 1001, student_id: 4, action: 'approve', teacher_ids: [1] },
    })
  })

  test('отклонение ученика, заявки преподавателя и правки профиля', async ({ page, mutations }) => {
    await pendingCard(page, 'Ольга Петрова').getByRole('button', { name: 'Отклонить' }).click()
    await expect.poll(() => mutations.length).toBe(1)
    await pendingCard(page, 'Олег Кандидатов').getByRole('button', { name: 'Одобрить' }).click()
    await expect.poll(() => mutations.length).toBe(2)
    await pendingCard(page, 'Максим Волков').getByRole('button', { name: 'Отклонить' }).click()
    await expect.poll(() => mutations.length).toBe(3)
    expect(mutations).toEqual([
      { method: 'POST', path: '/api/admin/students', body: { telegram_id: 1001, student_id: 4, action: 'reject' } },
      { method: 'POST', path: '/api/admin/teacher-applications', body: { telegram_id: 1001, application_id: 1, action: 'approve' } },
      { method: 'POST', path: '/api/admin/profile-edits/1', body: { telegram_id: 1001, action: 'reject' } },
    ])
  })

  test('настройка ученика: «Барбер» снимает преподавателей', async ({ page, mutations }) => {
    await tab(page, 'Ученики')
    await page.getByRole('button', { name: /Настроить/ }).first().click()
    const panel = page.locator('#admin-edit-1')
    await expect(panel.locator('input.aas-cb-1[value="1"]')).toBeChecked()
    await panel.getByRole('spinbutton', { name: 'Кол-во занятий' }).fill('18')
    await panel.getByLabel('Категория ученика').selectOption('barber')
    await expect(panel.locator('input.aas-cb-1').first()).toBeDisabled()
    await panel.getByRole('button', { name: 'Сохранить' }).click()
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations[0]).toEqual({
      method: 'POST',
      path: '/api/admin/update-student',
      body: { telegram_id: 1001, student_id: 1, lessons_count: 18, student_track: 'barber', teacher_ids: [] },
    })
    await expect(panel).toBeHidden()
  })

  test('отмена настройки сбрасывает изменения', async ({ page }) => {
    await tab(page, 'Ученики')
    await page.getByRole('button', { name: /Настроить/ }).first().click()
    const panel = page.locator('#admin-edit-1')
    await panel.getByRole('spinbutton', { name: 'Кол-во занятий' }).fill('3')
    await panel.getByRole('button', { name: 'Отмена' }).click()
    await expect(panel).toBeHidden()
    await page.getByRole('button', { name: /Настроить/ }).first().click()
    await expect(panel.getByRole('spinbutton', { name: 'Кол-во занятий' })).toHaveValue('15')
  })

  test('преподаватель → его ученик → чат', async ({ page }) => {
    await tab(page, 'Преп.')
    await page.locator('.card', { hasText: 'Ирина Соколова' }).first().click()
    await page.locator('.card', { hasText: 'Максим Волков' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Максим Волков' })).toBeVisible()
    await page.getByRole('button', { name: /Чат с учеником/ }).click()
    await expect(page.locator('.hdr h2')).toHaveText('Чат · Максим Волков')
  })

  test('чат из списка учеников', async ({ page }) => {
    await tab(page, 'Ученики')
    await page.getByRole('button', { name: 'Открыть чат' }).first().click()
    await expect(page.locator('.hdr h2')).toHaveText('Чат · Анна Смирнова')
    await expect(page.getByText('Отличный референс')).toBeVisible()
  })
})

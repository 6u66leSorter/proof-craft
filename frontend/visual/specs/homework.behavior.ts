import type { Page } from '@playwright/test'
import { expect, TARGET, test } from '../fixtures'
import { photoFiles } from '../photos'

const tab = (page: Page, name: string) => page.locator('.tb', { hasText: name }).click()
const openWork = async (page: Page, title: string) => {
  await tab(page, 'Работы')
  await page.locator('.card', { hasText: title }).last().click()
  await expect(page.locator('.hdr h2')).toHaveText(/^ДЗ #/)
}
const toast = (page: Page) => page.locator('.toast').last()
const multipartField = (body: unknown, name: string) => {
  const match = String(body).match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))
  return match ? match[1] : null
}

test.describe('домашние задания ученика: поведение', () => {
  test.beforeEach(async ({ openAs }) => {
    await openAs('student')
  })

  test('уведомление открывает работу', async ({ page, settle }) => {
    await tab(page, 'Увед.')
    await settle()
    await page.locator('.card', { hasText: 'Урок 3 отправлен на доработку' }).click()
    await expect(page.locator('.hdr h2')).toHaveText('ДЗ #3')
    await expect(page.getByText('Замечание преподавателя')).toBeVisible()
  })

  test('новое задание проверяет поля по порядку', async ({ page, mutations }) => {
    await page.getByRole('button', { name: /ДЗ/ }).first().click()
    const submit = page.getByRole('button', { name: 'Отправить на проверку' })
    await submit.click()
    await expect(toast(page)).toHaveText('Заполните номер задания, название и описание')
    await page.getByRole('textbox', { name: 'Название стрижки' }).fill('Кроп')
    await page.getByRole('textbox', { name: 'Подробное описание...' }).fill('Текстура')
    await page.getByRole('textbox', { name: 'Номер задания (урока)' }).fill('0')
    await submit.click()
    await expect(toast(page)).toHaveText('Номер задания — целое число больше нуля')
    await page.getByRole('textbox', { name: 'Номер задания (урока)' }).fill('16')
    await submit.click()
    await expect(toast(page)).toHaveText('Урок №16 недоступен. По вашей программе 15 уроков.')
    await page.getByRole('textbox', { name: 'Номер задания (урока)' }).fill('5')
    await submit.click()
    await expect(toast(page)).toHaveText('Добавьте хотя бы одно фото работы')
    expect(mutations).toEqual([])
  })

  test('бонусное задание не требует номера урока', async ({ page, mutations }) => {
    await page.getByRole('button', { name: /ДЗ/ }).first().click()
    const lesson = page.getByRole('textbox', { name: 'Номер задания (урока)' })
    await lesson.fill('4')
    await page.getByLabel(/Бонусное задание/).check()
    await expect(lesson).toBeDisabled()
    await expect(lesson).toHaveValue('')
    await expect(lesson).toHaveAttribute('placeholder', 'Не требуется (бонус)')
    await page.locator('input[type=file]').setInputFiles(photoFiles(1))
    await expect(page.locator('#hw-photos-grid img')).toHaveCount(1, { timeout: 20_000 })
    await page.getByRole('textbox', { name: 'Название стрижки' }).fill('Бонус')
    await page.getByRole('textbox', { name: 'Подробное описание...' }).fill('Техника')
    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    if (TARGET === 'legacy') {
      // Дефект legacy: номер требуется и для бонуса, хотя поле очищено и заблокировано.
      await expect(toast(page)).toHaveText('Заполните номер задания, название и описание')
      expect(mutations).toEqual([])
      return
    }
    await expect(page.getByText('Задание отправлено на проверку')).toBeVisible()
    expect(mutations).toHaveLength(1)
    expect(multipartField(mutations[0].body, 'is_bonus')).toBe('1')
    expect(multipartField(mutations[0].body, 'lesson_number')).toBeNull()
  })

  test('отправка задания показывает успех и возвращает назад', async ({ page, mutations }) => {
    await page.getByRole('button', { name: /ДЗ/ }).first().click()
    await page.locator('input[type=file]').setInputFiles(photoFiles(6))
    // Оба клиента показывают превью только после сжатия всех файлов; под нагрузкой это дольше 5 с.
    await expect(page.locator('#hw-photos-grid img')).toHaveCount(5, { timeout: 20_000 })
    await page.locator('#hw-photos-grid button').first().click()
    await expect(page.locator('#hw-photos-grid img')).toHaveCount(4, { timeout: 20_000 })
    await page.getByRole('textbox', { name: 'Номер задания (урока)' }).fill('5')
    await page.getByRole('textbox', { name: 'Название стрижки' }).fill('Кроп')
    await page.getByRole('textbox', { name: 'Подробное описание...' }).fill('Текстура')
    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page.getByText('Задание отправлено на проверку')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Анна Смирнова' })).toBeVisible({ timeout: 5000 })
    expect(mutations).toHaveLength(1)
    expect(mutations[0].path).toBe('/api/homeworks')
    const body = mutations[0].body
    expect(multipartField(body, 'telegram_id')).toBe('3001')
    expect(multipartField(body, 'is_bonus')).toBe('0')
    expect(multipartField(body, 'lesson_number')).toBe('5')
    expect(multipartField(body, 'haircut_name')).toBe('Кроп')
    expect(multipartField(body, 'text_content')).toBe('Текстура')
    expect(String(body).match(/name="file"; filename="[^"]+\.jpg"\r\nContent-Type: image\/jpeg/g)).toHaveLength(4)
  })

  test('«Назад» во время отправки отменяет загрузку', async ({ page }) => {
    await page.route('**/api/homeworks', (route) => (route.request().method() === 'POST' ? new Promise(() => {}) : route.fallback()))
    await page.getByRole('button', { name: /ДЗ/ }).first().click()
    await page.locator('input[type=file]').setInputFiles(photoFiles(1))
    await expect(page.locator('#hw-photos-grid img')).toHaveCount(1, { timeout: 20_000 })
    await page.getByRole('textbox', { name: 'Номер задания (урока)' }).fill('5')
    await page.getByRole('textbox', { name: 'Название стрижки' }).fill('Кроп')
    await page.getByRole('textbox', { name: 'Подробное описание...' }).fill('Текстура')
    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page.getByText('Идёт отправка')).toBeVisible()
    // Оверлей закрывает шапку; в Mini App назад ведёт системная кнопка, здесь — клик прямо по кнопке.
    await page.getByRole('button', { name: 'Назад' }).dispatchEvent('click')
    await expect(page.getByText('Идёт отправка')).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Анна Смирнова' })).toBeVisible()
  })

  test('комментарий к работе отправляется', async ({ page, mutations }) => {
    await openWork(page, 'Фейд')
    await page.getByRole('button', { name: 'Ответить' }).click()
    await expect(toast(page)).toHaveText('Напишите комментарий')
    const field = page.getByRole('textbox', { name: 'Ответить на комментарий или описать исправление…' })
    await field.fill('  Спасибо!  ')
    await page.getByRole('button', { name: 'Ответить' }).click()
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations).toEqual([{ method: 'POST', path: '/api/homeworks/1/comments', body: { telegram_id: 3001, text_content: 'Спасибо!' } }])
    await expect(field).toHaveValue('')
    // Дефект legacy: тост стирается перерисовкой сразу после показа; новый клиент его показывает.
    if (TARGET === 'next') await expect(toast(page)).toHaveText('Комментарий отправлен')
  })

  test('исправление работы уходит с описанием', async ({ page, mutations }) => {
    await openWork(page, 'Андеркат')
    const correction = page.getByRole('textbox', { name: 'Исправленное описание...' })
    await expect(correction).toHaveValue('Поправила окантовку и переход на висках.')
    await correction.fill('Выровняла переход')
    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations[0].path).toBe('/api/student/homeworks/3/revision')
    expect(multipartField(mutations[0].body, 'revision_text')).toBe('Выровняла переход')
    // После обновления работы поле показывает сохранённое на сервере исправление (здесь сервер не менялся).
    await expect(correction).toHaveValue('Поправила окантовку и переход на висках.')
    if (TARGET === 'next') await expect(toast(page)).toHaveText('Исправление отправлено')
  })

  test('правка работы на проверке удаляет фото и сохраняет поля', async ({ page, mutations }) => {
    await openWork(page, 'Борода')
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
    await expect(page.getByText('Добавить фото (ещё 4)')).toBeVisible()
    await page.getByRole('button', { name: '×' }).nth(1).click()
    await expect(page.getByText('Добавить фото (ещё 5)')).toBeVisible()
    await page.getByRole('textbox', { name: 'Название стрижки' }).fill('Борода и усы')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(toast(page)).toHaveText('Сохранено')
    await expect(page.getByText('Редактировать ДЗ')).toBeHidden()
    expect(mutations).toHaveLength(1)
    expect(mutations[0].method).toBe('PATCH')
    expect(mutations[0].path).toBe('/api/student/homeworks/4')
    // Дефект legacy: перед отправкой модалка перерисовывается и введённое название теряется.
    expect(multipartField(mutations[0].body, 'haircut_name')).toBe(TARGET === 'legacy' ? 'Борода' : 'Борода и усы')
    expect(multipartField(mutations[0].body, 'text_content')).toBe('Оформление бороды.')
    expect(multipartField(mutations[0].body, 'remove_primary')).toBe('1')
  })
})

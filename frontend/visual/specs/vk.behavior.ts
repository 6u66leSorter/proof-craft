import { expect, test } from '../fixtures'

test.describe('запуск с параметрами VK', () => {
  test('вне VK с неподписанными параметрами показывает ошибку подписи', async ({ openAs, page }) => {
    await openAs(null, '?vk_user_id=7001&vk_app_id=54558405&vk_platform=mobile_web')
    await expect(page.locator('.hdr h2')).toHaveText('Ошибка')
    await expect(page.getByText('Недействительная подпись VK launch params.')).toBeVisible()
  })
})

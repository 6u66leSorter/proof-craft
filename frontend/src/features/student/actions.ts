import { apiPost, apiUrl } from '../../api/client'
import { multipartHeaders, ownAvatarUrl } from '../../api/files'
import { useApp } from '../../app/store'
import { forgetAuthImage } from '../../ui/AuthImg'
import { toast } from '../../ui/toast'

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback

/** Выбор и загрузка нового аватара. */
export function changeAvatar() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.style.display = 'none'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    try {
      const response = await fetch(apiUrl(`/api/student/me/avatar?telegram_id=${encodeURIComponent(String(useApp.getState().appUserId))}`), {
        method: 'POST',
        headers: multipartHeaders(),
        body: form,
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || 'Ошибка загрузки')
      const { session, imageEpoch } = useApp.getState()
      forgetAuthImage(ownAvatarUrl())
      if (session?.student) {
        useApp.getState().patch({ session: { ...session, student: { ...session.student, has_avatar: true } }, imageEpoch: imageEpoch + 1 })
      }
      toast('Аватар обновлён')
    } catch (error) {
      toast(message(error, 'Не удалось загрузить фото'))
    }
  })
  document.body.appendChild(input)
  input.click()
}

export async function saveAbout(text: string) {
  const about = text.trim()
  const { platform, appUserId } = useApp.getState()
  try {
    await apiPost(platform, '/api/student/about', { telegram_id: appUserId, about_me: about })
    const { session } = useApp.getState()
    if (session?.student) useApp.getState().patch({ session: { ...session, student: { ...session.student, about_me: about } } })
    toast('Сохранено')
  } catch (error) {
    toast(message(error, 'Не удалось сохранить'))
  }
}

export const openProfileEdit = () => useApp.getState().patch({ profileEdit: { open: true, busy: false, error: '' } })
export const closeProfileEdit = () => useApp.getState().patch({ profileEdit: { open: false, busy: false, error: '' } })

export async function submitProfileEdit(form: { firstName: string; lastName: string; phone: string; metro: string }) {
  const fn = form.firstName.trim()
  const ln = form.lastName.trim()
  const phone = form.phone.trim()
  const metro = form.metro.trim()
  const setModal = (patch: Partial<ReturnType<typeof useApp.getState>['profileEdit']>) =>
    useApp.getState().patch({ profileEdit: { ...useApp.getState().profileEdit, ...patch } })
  if (!fn || !ln || !phone) {
    setModal({ error: 'Заполните обязательные поля (имя, фамилия, телефон).' })
    return
  }
  setModal({ busy: true, error: '' })
  const { platform, appUserId } = useApp.getState()
  try {
    await apiPost(platform, '/api/student/profile-edit', {
      telegram_id: appUserId,
      full_name: [fn, ln].filter(Boolean).join(' ').trim(),
      phone,
      metro: metro || undefined,
    })
    closeProfileEdit()
    toast('Заявка отправлена, ожидайте одобрения')
  } catch (error) {
    setModal({ busy: false, error: message(error, 'Не удалось отправить') })
  }
}

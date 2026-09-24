import { apiPost } from '../../api/client'
import { bootstrap } from '../../app/bootstrap'
import { useApp } from '../../app/store'
import { STORAGE_KEYS, session } from '../../platform/storage'
import { toast } from '../../ui/toast'

export type RegisterRole = 'student' | 'teacher' | 'admin' | 'guest'

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback

/** Выбор роли на стартовом экране. */
export function pickRegisterRole(role: RegisterRole) {
  const app = useApp.getState()
  if (role === 'guest') {
    try {
      sessionStorage.setItem(STORAGE_KEYS.guest, '1')
    } catch {
      // без sessionStorage гостевой режим не переживёт перезагрузку — не критично
    }
    app.patch({ isGuestMode: true, registerRole: null, registerTab: 'reg', teacherApplicationSent: false })
    app.go('guest')
    return
  }
  app.patch({ registerRole: role, registerTab: 'reg', teacherApplicationSent: false })
  app.go('register-flow')
}

export type StudentForm = { firstName: string; lastName: string; phone: string; metro: string; lessons: string }

export async function submitStudentRegistration(form: StudentForm) {
  const fn = form.firstName.trim()
  const ln = form.lastName.trim()
  const phone = form.phone.trim()
  const metro = form.metro.trim()
  const lessons = form.lessons.trim()
  if (!fn || !ln || !phone || !lessons) {
    toast('Заполните обязательные поля')
    return
  }
  const { platform, appUserId } = useApp.getState()
  try {
    await apiPost(platform, '/api/students', {
      telegram_id: appUserId,
      full_name: [fn, ln].filter(Boolean).join(' ').trim(),
      phone,
      lessons_count: lessons,
      first_name: fn,
      last_name: ln,
      metro: metro || undefined,
    })
    toast('Заявка отправлена')
    useApp.getState().go('loading')
    await bootstrap()
  } catch (error) {
    toast(errorMessage(error, 'Не удалось отправить'))
  }
}

export type TeacherForm = { firstName: string; lastName: string; phone: string }

export async function submitTeacherApplication(form: TeacherForm) {
  const fn = form.firstName.trim()
  const ln = form.lastName.trim()
  const phone = form.phone.trim()
  if (!fn || !ln || !phone) {
    toast('Заполните все поля')
    return
  }
  const { platform, appUserId } = useApp.getState()
  try {
    await apiPost(platform, '/api/teacher-application', {
      telegram_id: appUserId,
      full_name: [fn, ln].filter(Boolean).join(' ').trim(),
      phone,
    })
    useApp.getState().patch({ teacherApplicationSent: true })
    toast('Заявка отправлена')
  } catch (error) {
    toast(errorMessage(error, 'Не удалось отправить'))
  }
}

/** Привязка VK к аккаунту по коду из Telegram. */
export async function confirmVkBind(rawCode: string) {
  const token = rawCode.trim().replace(/\D/g, '').slice(0, 4)
  if (token.length !== 4) {
    toast('Введите 4 цифры кода из Telegram')
    return
  }
  const { platform, appUserId } = useApp.getState()
  try {
    await apiPost(platform, '/api/account/vk-link-confirm', { telegram_id: appUserId, token })
    toast('Аккаунт привязан')
    useApp.getState().go('loading')
    await bootstrap()
  } catch (error) {
    toast(errorMessage(error, 'Не удалось привязать'))
  }
}

export const clearGuestMode = () => session.remove(STORAGE_KEYS.guest)

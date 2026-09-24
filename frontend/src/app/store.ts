import { create } from 'zustand'
import type { Session } from '../api/types'
import type { PhotoItem } from '../domain/homework'
import type { Platform } from '../platform/detect'
import type { ScreenName } from './screens'

type Selection = {
  selectedStudent: unknown
  selectedHomework: unknown
  selectedAdminTeacher: unknown
}

export type WebLoginState = {
  status: 'idle' | 'starting' | 'waiting' | 'expired' | 'error'
  error: string
  provider: 'telegram' | 'vk' | null
  token: string | null
}

export const WEB_LOGIN_IDLE: WebLoginState = { status: 'idle', error: '', provider: null, token: null }

type StackEntry = Selection & { scr: ScreenName; tab: string | null }

type GoData = { student?: unknown; homework?: unknown; tab?: string; adminTeacher?: unknown }

type AppState = Selection & {
  scr: ScreenName
  stack: StackEntry[]
  tab: string | null
  platform: Platform | null
  appUserId: number | null
  session: Session | null
  error: string
  isGuestMode: boolean
  /** Выбор роли и вкладка «Вход / Регистрация» на экранах регистрации. */
  registerRole: string | null
  registerTab: 'reg' | 'login'
  teacherApplicationSent: boolean
  /** Вход на обычном сайте через подтверждение в Telegram или VK. */
  webLogin: WebLoginState
  /** Модалка заявки на изменение профиля ученика. */
  profileEdit: { open: boolean; busy: boolean; error: string }
  /** Отзыв ученика администратору. */
  feedback: { subject: 'teacher' | 'academy' | 'other'; message: string; key: string | null; busy: boolean; sent: boolean; error: string }
  /** Генерация кода для входа из VK (только Telegram). */
  vkLinkGenerate: { loading: boolean; token: string | null; expiresAt: string | null; error: string }
  /** Меняется после загрузки нового аватара, чтобы картинка перезапросилась. */
  avatarVersion: number
  /** Просмотр фото поверх экрана; сбрасывается при любом переходе. */
  lightbox: { items: PhotoItem[]; index: number } | null
  /** Категория учеников в гостевой витрине. */
  guestTrack: 'student' | 'intern' | 'barber'
  /** Выбранный в гостевой витрине ученик. */
  guestStudentId: number | null

  /** Переход с сохранением текущего экрана в стек (legacy `go`). */
  go: (scr: ScreenName, data?: GoData) => void
  /** Возврат к предыдущему экрану (legacy `back`). */
  back: () => void
  /** Замена экрана без записи в стек (legacy: прямое присваивание `state.scr` + `render`). */
  replace: (scr: ScreenName, patch?: Partial<AppState>) => void
  setTab: (tab: string) => void
  patch: (patch: Partial<AppState>) => void
}

export const useApp = create<AppState>()((set, get) => ({
  scr: 'loading',
  stack: [],
  tab: null,
  platform: null,
  appUserId: null,
  session: null,
  error: '',
  isGuestMode: false,
  registerRole: null,
  registerTab: 'reg',
  teacherApplicationSent: false,
  webLogin: WEB_LOGIN_IDLE,
  profileEdit: { open: false, busy: false, error: '' },
  feedback: { subject: 'teacher', message: '', key: null, busy: false, sent: false, error: '' },
  vkLinkGenerate: { loading: false, token: null, expiresAt: null, error: '' },
  avatarVersion: 0,
  lightbox: null,
  guestTrack: 'student',
  guestStudentId: null,
  selectedStudent: null,
  selectedHomework: null,
  selectedAdminTeacher: null,

  go: (scr, data) => {
    const s = get()
    set({
      lightbox: null,
      stack: [
        ...s.stack,
        {
          scr: s.scr,
          tab: s.tab,
          selectedStudent: s.selectedStudent,
          selectedHomework: s.selectedHomework,
          selectedAdminTeacher: s.selectedAdminTeacher,
        },
      ],
      scr,
      ...(data?.student ? { selectedStudent: data.student } : {}),
      ...(data?.homework ? { selectedHomework: data.homework } : {}),
      ...(data?.tab ? { tab: data.tab } : {}),
      ...(data?.adminTeacher ? { selectedAdminTeacher: data.adminTeacher } : {}),
    })
  },

  back: () => {
    const stack = get().stack
    const prev = stack[stack.length - 1]
    if (!prev) {
      set({ lightbox: null })
      return
    }
    set({
      lightbox: null,
      stack: stack.slice(0, -1),
      scr: prev.scr,
      tab: prev.tab,
      selectedStudent: prev.selectedStudent,
      selectedHomework: prev.selectedHomework,
      selectedAdminTeacher: prev.selectedAdminTeacher ?? null,
    })
  },

  replace: (scr, patch) => set({ ...patch, scr }),
  setTab: (tab) => set({ tab }),
  patch: (patch) => set(patch),
}))

import { urlLooksLikeVkMiniApp } from './platformEnv.js'

const VK_ID_OFFSET = 10_000_000_000
/** Только для локального Vite-предпросмотра; production-сборка всегда отключает этот путь. */
const LOCAL_PREVIEW_USER_ID = 9_000_000_001
const LOCAL_PREVIEW_TEACHER_ID = 9_000_000_002
const LOCAL_PREVIEW_GUEST_ID = 9_000_000_099

const vkBridge = typeof window !== 'undefined' ? window.vkBridge : null

/** Не кэшировать на уровне модуля: Telegram SDK может подгрузиться после main.js */
function getTg() {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : null
}

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
/** Гостевой режим переживает перезагрузку (нет аккаунта в БД) */
const GUEST_STORAGE_KEY = 'ba_guest_mode'
/** Сессия сайта непрозрачна и проверяется сервером при каждом запросе. */
const WEB_SESSION_STORAGE_KEY = 'ba_web_session'
const THEME_STORAGE_KEY = 'ba_theme'
const apiUrl = (path) => {
  const p = path.startsWith('/') ? path : `/${path}`
  return API_BASE_URL ? `${API_BASE_URL}${p}` : p
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')

const feedbackSubject = (subject) => ({ teacher: 'О преподавателе', academy: 'Об академии', other: 'Другой вопрос' })[subject] || 'Об обучении'

const studentStatusRu = (status) => {
  const m = {
    moderation: 'На модерации',
    studying: 'Обучается',
    completed: 'Завершил',
    rejected: 'Отклонён',
  }
  return m[String(status || '')] || String(status || '—')
}

const studentTrackRu = (track) => {
  const m = { student: 'Ученик', intern: 'Стажёр', barber: 'Барбер' }
  return m[String(track || '')] || 'Ученик'
}

/** Статус домашней работы с API (pending, revision, …) — для подписей в UI */
const homeworkStatusRu = (status) => {
  const m = {
    pending: 'На проверке',
    approved: 'Принято',
    rejected: 'Отклонено',
    revision: 'На доработке',
  }
  return m[String(status || '')] || String(status || '—')
}

const initialsFromName = (name) => {
  const p = String(name || '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
  if (!p.length) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

/** Сжатие перед отправкой: ограничение по длинной стороне и JPEG без агрессивного даунскейла. */
const compressImageToJpegFile = (file, maxSide = 2400) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const u = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(u)
      let w = img.naturalWidth || img.width
      let h = img.naturalHeight || img.height
      const scale = Math.min(1, maxSide / Math.max(w, h, 1))
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      c.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('toBlob'))
            return
          }
          const base = String(file.name || 'photo').replace(/\.[^.]+$/, '')
          resolve(new File([blob], `${base || 'photo'}.jpg`, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.92,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(u)
      reject(new Error('image'))
    }
    img.src = u
  })

/** SVG-иконки как в `files_new/barber-academy.html` (в т.ч. нижняя панель `.tab`). */
const ICO = {
  back: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  forward: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7 4L13 10L7 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chat: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg>',
  users: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  camera:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="2"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>',
  shield:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  scissors:
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="6" r="3" stroke="#C9A227" stroke-width="1.5"/><circle cx="6" cy="18" r="3" stroke="#C9A227" stroke-width="1.5"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" stroke="#C9A227" stroke-width="1.5" stroke-linecap="round"/></svg>',
  inbox:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 12h-6l-2 3H10l-2-3H2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  logout:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="2"/></svg>',
  clock:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
}

const toast = (root, msg) => {
  const n = document.createElement('div')
  n.className = 'toast'
  n.textContent = msg
  root.appendChild(n)
  setTimeout(() => n.remove(), 2200)
}

const hdr = (title, canBack, onBackJs, rightHtml = '') => `
  <div class="hdr">
    ${canBack ? `<button class="hdr-btn" onclick="${onBackJs}">${ICO.back}</button>` : `<span style="width:24px"></span>`}
    <h2>${esc(title)}</h2>
    ${rightHtml || `<span style="width:24px"></span>`}
  </div>
`

async function detectPlatform() {
  const url = new URL(window.location.href)
  const params = url.searchParams
  const tg = getTg()

  /** Сначала Telegram: есть валидный initData — всегда он (один билд для TG+VK) */
  if (tg?.initData) {
    const id = Number(tg?.initDataUnsafe?.user?.id || 0)
    return { platform: 'telegram', appUserId: id > 0 ? id : null, vkUserId: null, launchParams: null }
  }

  const vkUserId = Number(params.get('vk_user_id') || 0)
  const hasVk = urlLooksLikeVkMiniApp(window.location.href)

  if (hasVk) {
    let realVkUserId = vkUserId > 0 ? vkUserId : null
    try {
      if (vkBridge?.send) {
        await vkBridge.send('VKWebAppInit')
        const vkUser = await vkBridge.send('VKWebAppGetUserInfo')
        if (vkUser?.id) realVkUserId = Number(vkUser.id)
      }
    } catch {
      // ignore
    }
    const mapped = realVkUserId ? VK_ID_OFFSET + realVkUserId : null
    const launchParamsRaw = window.location.search.startsWith('?')
      ? window.location.search.slice(1)
      : window.location.search
    const platform = { platform: 'vk', appUserId: mapped, vkUserId: realVkUserId, launchParams: launchParamsRaw || null }
    const webLoginToken = params.get('web_login')
    if (webLoginToken && realVkUserId) {
      try {
        const r = await fetch(apiUrl(`/api/web-auth/confirm/vk?token=${encodeURIComponent(webLoginToken)}`), {
          method: 'POST',
          headers: buildHeaders(platform),
        })
        if (r.ok) document.body.dataset.baWebLoginConfirmed = '1'
      } catch {
        // Пользователь всё ещё может войти через обычный запуск VK Mini App.
      }
    }
    return platform
  }

  /**
   * Позволяет посмотреть регистрацию и гостевой раздел в обычном браузере.
   * Vite заменяет DEV при сборке, поэтому в production этот обход недоступен.
   * Локальный API всё равно должен быть запущен разработчиком отдельно.
   */
  if (import.meta.env.DEV && ['1', 'student', 'admin'].includes(params.get('preview'))) {
    return { platform: 'standalone', appUserId: LOCAL_PREVIEW_USER_ID, vkUserId: null, launchParams: null }
  }
  if (import.meta.env.DEV && params.get('preview') === 'teacher') {
    return { platform: 'standalone', appUserId: LOCAL_PREVIEW_TEACHER_ID, vkUserId: null, launchParams: null }
  }
  if (import.meta.env.DEV && params.get('preview') === 'guest') {
    return { platform: 'standalone', appUserId: LOCAL_PREVIEW_GUEST_ID, vkUserId: null, launchParams: null }
  }

  let webSessionToken = null
  try { webSessionToken = localStorage.getItem(WEB_SESSION_STORAGE_KEY) } catch { /* ignore */ }
  return { platform: 'standalone', appUserId: null, vkUserId: null, launchParams: null, webSessionToken }
}

function buildHeaders(platform) {
  const h = { 'Content-Type': 'application/json' }
  if (platform?.platform) h['X-Client-Platform'] = platform.platform
  if (platform?.webSessionToken) h['X-Web-Session'] = platform.webSessionToken

  const tg = getTg()
  if (platform?.platform === 'telegram' && tg?.initData) {
    h['X-Telegram-Init-Data'] = tg.initData
  }
  if (platform?.platform === 'vk' && platform.vkUserId) {
    h['X-VK-User-Id'] = String(platform.vkUserId)
    if (platform.appUserId) h['X-App-User-Id'] = String(platform.appUserId)
    if (platform.launchParams) h['X-VK-Launch-Params'] = String(platform.launchParams)
  }
  return h
}

async function apiGet(platform, path) {
  const r = await fetch(apiUrl(path), { method: 'GET', cache: 'no-store', headers: buildHeaders(platform) })
  const payload = await r.json().catch(() => ({}))
  if (!r.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка запроса (${r.status}).`)
  return payload?.data ?? payload
}

async function apiPost(platform, path, body) {
  const r = await fetch(apiUrl(path), {
    method: 'POST',
    cache: 'no-store',
    headers: buildHeaders(platform),
    body: JSON.stringify(body ?? {}),
  })
  const payload = await r.json().catch(() => ({}))
  if (!r.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка запроса (${r.status}).`)
  return payload?.data ?? payload
}

export function startApp(root) {
  if (!root) throw new Error('Root element not found')
  try { document.documentElement.dataset.theme = localStorage.getItem(THEME_STORAGE_KEY) || 'light' } catch { document.documentElement.dataset.theme = 'light' }

  /** Только настоящий Telegram Mini App (есть initData); иначе тишина — важно для VK WebView */
  const tgInit = getTg()
  if (tgInit?.initData) {
    try {
      tgInit.ready()
      tgInit.expand()
      tgInit.setHeaderColor('#080808')
      tgInit.setBackgroundColor('#080808')
      document.documentElement.style.setProperty('--safe-top', (tgInit.safeAreaInset?.top || 0) + 'px')
      document.documentElement.style.setProperty('--safe-bottom', (tgInit.safeAreaInset?.bottom || 0) + 'px')
    } catch {
      // ignore
    }
  }

  const state = {
    scr: 'loading',
    stack: [],
    tab: null,
    platform: null,
    appUserId: null,
    session: null,
    error: '',
    webLogin: { status: 'idle', error: '', provider: null, token: null },

    notifications: { status: 'idle', items: [], unread: 0, error: '' },
    studentHomeworks: { status: 'idle', items: [], avg: null, count: 0, error: '' },
    teacherStudents: { status: 'idle', items: [], error: '' },
    teacherDashboard: { status: 'idle', data: null, error: '' },
    teacherStudentHomeworks: { status: 'idle', student: null, items: [], error: '' },
    adminModeration: { status: 'idle', items: [], error: '' },
    adminProfileEdits: { status: 'idle', items: [], error: '' },
    adminStudents: { status: 'idle', items: [], error: '' },
    adminTeachers: { status: 'idle', items: [], error: '' },
    adminEditOpenId: null,
    adminStudentProfile: { status: 'idle', student: null, homeworks: [], error: '' },

    chats: { status: 'idle', students: [], messagesByStudentId: new Map(), error: '' },

    selectedStudent: null,
    selectedHomework: null,
    /** Фотографии открытой работы и просмотрщик поверх экрана. */
    photoItems: [],
    lightbox: null,
    feedback: { subject:'teacher', message:'', key:null, busy:false, sent:false, error:'' },
    adminFeedback: { items:[], next:null, busy:false, error:'' },
    studentSearch: { admin: { open: false, query: '', track: 'student' }, teacher: { open: false, query: '', track: 'student' } },

    /** Макет входа: выбор роли → вкладки Вход / Регистрация */
    registerRole: null,
    registerTab: 'reg',
    teacherApplicationSent: false,

    isGuestMode: false,
    guestTrack: 'student',
    guestPortfolio: { status: 'idle', students: [], error: '' },
    guestStudentProfile: { status: 'idle', student: null, homeworks: [], error: '' },

    adminTeacherApplications: { status: 'idle', items: [], error: '' },

    profileEditModal: { open: false, busy: false, error: '' },
    hwEditModal: { open: false, homeworkId: null, busy: false, error: '', removedPrimary: false, removedAttachmentIds: [], newPhotos: [] },

    /** Код привязки Telegram → VK (генерация только из Telegram) */
    vkLinkGenerate: { loading: false, token: null, expiresAt: null, error: '' },

    /** Отправка ДЗ: оверлей загрузки / успех / ошибка */
    hwSubmit: { status: 'idle', error: '' },
    hwSubmitAborted: false,
    _hwSubmitAbort: null,
    hwSubmitInFlight: false,

    /** Макет «Новое ДЗ»: превью фото до отправки (сжатие как в макете). */
    hwNewDraft: { items: [] },
    /** Экран преподавателя в админке (список его учеников). */
    selectedAdminTeacher: null,
  }

  const go = (scr, data = null) => {
    state.lightbox = null
    if (scr === 'hw-new') {
      state.hwNewDraft = { items: [] }
    }
    state.stack.push({ scr: state.scr, tab: state.tab, selectedStudent: state.selectedStudent, selectedHomework: state.selectedHomework, selectedAdminTeacher: state.selectedAdminTeacher })
    state.scr = scr
    if (data?.student) state.selectedStudent = data.student
    if (data?.homework) state.selectedHomework = data.homework
    if (data?.tab) state.tab = data.tab
    if (data?.adminTeacher) state.selectedAdminTeacher = data.adminTeacher
    render()
    syncTelegramBackButton()
  }

  const back = () => {
    state.lightbox = null
    if (state.scr === 'hw-new' && state.hwSubmit.status === 'loading') {
      state.hwSubmitAborted = true
      state.hwSubmitInFlight = false
      try {
        state._hwSubmitAbort?.()
      } catch {
        // ignore
      }
      state._hwSubmitAbort = null
      state.hwSubmit = { status: 'idle', error: '' }
    }
    const prev = state.stack.pop()
    if (!prev) return
    state.scr = prev.scr
    state.tab = prev.tab
    state.selectedStudent = prev.selectedStudent
    state.selectedHomework = prev.selectedHomework
    state.selectedAdminTeacher = prev.selectedAdminTeacher ?? null
    render()
    syncTelegramBackButton()
  }

  const setTab = (tab) => {
    state.tab = tab
    render()
  }

  const logout = () => {
    if (state.platform?.webSessionToken) {
      void apiPost(state.platform, '/api/web-auth/logout', {}).catch(() => {})
      try { localStorage.removeItem(WEB_SESSION_STORAGE_KEY) } catch { /* ignore */ }
    }
    try {
      sessionStorage.removeItem(GUEST_STORAGE_KEY)
    } catch {
      // ignore
    }
    state.session = null
    state.error = ''
    state.stack = []
    state.tab = null
    state.selectedStudent = null
    state.selectedHomework = null
    state.adminEditOpenId = null
    state.adminStudentProfile = { status: 'idle', student: null, homeworks: [], error: '' }
    state.registerRole = null
    state.registerTab = 'reg'
    state.teacherApplicationSent = false
    state.isGuestMode = false
    state.guestPortfolio = { status: 'idle', students: [], error: '' }
    state.guestStudentProfile = { status: 'idle', student: null, homeworks: [], error: '' }
    state.vkLinkGenerate = { loading: false, token: null, expiresAt: null, error: '' }
    state.hwSubmit = { status: 'idle', error: '' }
    state.hwSubmitAborted = false
    state._hwSubmitAbort = null
    state.hwSubmitInFlight = false
    state.hwNewDraft = { items: [] }
    state.selectedAdminTeacher = null
    go('loading')
    void bootstrap()
  }

  const syncTelegramBackButton = () => {
    const tgBtn = getTg()
    if (!tgBtn?.initData) return
    try {
      if (state.stack.length > 0) {
        tgBtn.BackButton.show()
        tgBtn.BackButton.onClick(back)
      } else {
        tgBtn.BackButton.hide()
      }
    } catch {
      // ignore
    }
  }

  async function bootstrap() {
    state.error = ''
    const pageParams = new URLSearchParams(window.location.search)
    const localPreview = import.meta.env.DEV ? pageParams.get('preview') : null
    if (localPreview === 'demo') {
      state.scr = 'demo-home'
      state.stack = []
      render()
      return
    }
    state.platform = await detectPlatform()
    state.appUserId = state.platform.appUserId

    // Публичная витрина не требует Telegram, VK или учётной записи.
    if (pageParams.get('guest') === '1') {
      state.isGuestMode = true
      state.scr = 'guest'
      state.stack = []
      render()
      void loadGuestPortfolio()
      return
    }

    if (!state.appUserId && state.platform.webSessionToken) {
      try {
        const session = await apiGet(state.platform, '/api/web-auth/session')
        state.platform.appUserId = session.telegram_id
        state.appUserId = session.telegram_id
      } catch {
        try { localStorage.removeItem(WEB_SESSION_STORAGE_KEY) } catch { /* ignore */ }
        state.platform.webSessionToken = null
      }
    }

    if (!state.appUserId) {
      state.scr = 'web-login'
      state.stack = []
      render()
      return
    }

    try {
      const session = await apiGet(state.platform, `/api/session?telegram_id=${encodeURIComponent(state.appUserId)}`)
      state.session = session

      if (session?.hasUser) {
        try {
          sessionStorage.removeItem(GUEST_STORAGE_KEY)
        } catch {
          // ignore
        }
        state.isGuestMode = false
      }

      let resumeGuest = false
      try {
        resumeGuest = sessionStorage.getItem(GUEST_STORAGE_KEY) === '1'
      } catch {
        resumeGuest = false
      }

      const directGuestPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'guest'
      if (!session?.hasUser && (resumeGuest || directGuestPreview)) {
        state.isGuestMode = true
        state.tab = null
        state.registerRole = null
        state.registerTab = 'reg'
        state.teacherApplicationSent = false
        state.scr = 'guest'
        state.stack = []
        render()
        void loadGuestPortfolio()
        syncTelegramBackButton()
        return
      }

      if (!session?.hasUser) {
        state.tab = null
        state.registerRole = null
        state.registerTab = 'reg'
        state.teacherApplicationSent = false
        state.isGuestMode = false
        go('register-role')
        return
      }
      if (pageParams.get('feedback') === '1' && session?.student) {
        state.tab = 'home'
        state.scr = 'student'
        go('feedback')
      } else if (localPreview === 'student' && session?.student) {
        state.tab = 'home'
        go('student')
        void loadStudentHomeworks()
      } else if (session?.isAdmin) {
        state.tab = 'pending'
        go('admin')
        void loadAdminModeration()
      } else if (session?.isTeacher) {
        state.tab = 'profile'
        go('teacher')
        void loadTeacherStudents()
        void loadTeacherDashboard()
      } else {
        state.tab = 'home'
        go('student')
        void loadStudentHomeworks()
      }
    } catch (e) {
      state.error = e?.message || 'Не удалось загрузить данные'
      go('error')
    }
  }

  const startWebsiteLogin = async (provider) => {
    state.webLogin = { status: 'starting', error: '', provider, token: null }
    render()
    try {
      const data = await apiPost({ platform: 'standalone' }, '/api/web-auth/start', { provider })
      state.webLogin = { status: 'waiting', error: '', provider, token: data.token }
      render()
      window.open(data.handoff_url, '_blank', 'noopener')
      const until = Date.now() + Number(data.expires_in_seconds || 900) * 1000
      const poll = async () => {
        if (Date.now() >= until || state.webLogin.token !== data.token) {
          state.webLogin = { status: 'expired', error: 'Время подтверждения истекло. Начните вход ещё раз.', provider: null, token: null }
          render()
          return
        }
        try {
          const result = await apiGet({ platform: 'standalone' }, `/api/web-auth/status?token=${encodeURIComponent(data.token)}`)
          if (result.status === 'approved' && result.session_token) {
            localStorage.setItem(WEB_SESSION_STORAGE_KEY, result.session_token)
            state.webLogin = { status: 'idle', error: '', provider: null, token: null }
            await bootstrap()
            return
          }
        } catch (error) {
          if (String(error?.message || '').includes('истекло')) {
            state.webLogin = { status: 'expired', error: error.message, provider: null, token: null }
            render()
            return
          }
        }
        setTimeout(poll, 2500)
      }
      setTimeout(poll, 1200)
    } catch (error) {
      state.webLogin = { status: 'error', error: error?.message || 'Не удалось начать вход.', provider: null, token: null }
      render()
    }
  }

  async function submitStudentRegistration() {
    const fn = document.getElementById('r-fn')?.value?.trim()
    const ln = document.getElementById('r-ln')?.value?.trim()
    const phone = document.getElementById('r-phone')?.value?.trim()
    const metro = document.getElementById('r-metro')?.value?.trim()
    const lessons = document.getElementById('r-lessons')?.value?.trim()
    const fullName = [fn, ln].filter(Boolean).join(' ').trim()
    if (!fn || !ln || !phone || !lessons) {
      toast(root, 'Заполните обязательные поля')
      return
    }
    try {
      await apiPost(state.platform, '/api/students', {
        telegram_id: state.appUserId,
        full_name: fullName,
        phone,
        lessons_count: lessons,
        first_name: fn,
        last_name: ln,
        metro: metro || undefined,
      })
      toast(root, 'Заявка отправлена')
      go('loading')
      await bootstrap()
    } catch (e) {
      toast(root, e?.message || 'Не удалось отправить')
    }
  }

  async function submitTeacherApplication() {
    const fn = document.getElementById('t-fn')?.value?.trim()
    const ln = document.getElementById('t-ln')?.value?.trim()
    const phone = document.getElementById('t-phone')?.value?.trim()
    const fullName = [fn, ln].filter(Boolean).join(' ').trim()
    if (!fn || !ln || !phone) {
      toast(root, 'Заполните все поля')
      return
    }
    try {
      await apiPost(state.platform, '/api/teacher-application', {
        telegram_id: state.appUserId,
        full_name: fullName,
        phone,
      })
      state.teacherApplicationSent = true
      render()
      toast(root, 'Заявка отправлена')
    } catch (e) {
      toast(root, e?.message || 'Не удалось отправить')
    }
  }

  const homeworkFileQuery = (preview) => {
    const q = new URLSearchParams({ telegram_id: String(state.appUserId) })
    if (preview) q.set('preview', '1')
    return q.toString()
  }

  const getHomeworkFileUrl = (homeworkId, preview = false) =>
    apiUrl(
      `/api/homeworks/${encodeURIComponent(homeworkId)}/file?${homeworkFileQuery(preview)}`,
    )

  const getHomeworkRevisionFileUrl = (homeworkId, preview = false) =>
    apiUrl(`/api/homeworks/${encodeURIComponent(homeworkId)}/revision/file?${homeworkFileQuery(preview)}`)

  const getHomeworkAttachmentFileUrl = (homeworkId, attachmentId, preview = false) =>
    apiUrl(
      `/api/homeworks/${encodeURIComponent(homeworkId)}/attachments/${encodeURIComponent(attachmentId)}/file?${homeworkFileQuery(preview)}`,
    )

  const getStudentAvatarUrl = (studentId) =>
    apiUrl(`/api/students/${encodeURIComponent(studentId)}/avatar?telegram_id=${encodeURIComponent(state.appUserId)}`)

  const getGuestStudentAvatarUrl = (studentId) => apiUrl(`/api/guest/students/${encodeURIComponent(studentId)}/avatar`)

  /**
   * Фото ученика поверх круга с инициалами или демонстрационной подложки.
   * Пусто, если ученик ещё не загрузил аватар, — тогда остаётся прежнее оформление.
   * Круг-контейнер должен иметь `position:relative;overflow:hidden`.
   */
  const studentAvatarImg = (student, urlBuilder, { rounded = true } = {}) => {
    if (!student?.has_avatar || student.id == null) return ''
    const name = String(student.full_name || '').trim() || 'ученика'
    return `<img data-auth-src="${esc(urlBuilder(student.id))}" src="" alt="Фото ${esc(name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover${rounded ? ';border-radius:50%' : ''}">`
  }

  const homeworkPortfolioPhotoMeta = (hw) => {
    const primaryPhoto = hw.content_type === 'photo' && (hw.has_local_file || hw.has_telegram_file)
    const atts = Array.isArray(hw.attachments) ? hw.attachments : []
    const extraPhotos = atts.filter((a) => a.content_type === 'photo' && (a.has_local_file || a.has_telegram_file))
    const n = (primaryPhoto ? 1 : 0) + extraPhotos.length
    let thumbUrl = null
    if (primaryPhoto) thumbUrl = getHomeworkFileUrl(hw.id, true)
    else if (extraPhotos.length) thumbUrl = getHomeworkAttachmentFileUrl(hw.id, extraPhotos[0].id, true)
    return { n, thumbUrl }
  }

  const demoHomeworkPhotoUrl = (hw) => {
    if (!import.meta.env.DEV || Number(state.appUserId) !== LOCAL_PREVIEW_USER_ID) return null
    const photos = ['/demo-homework-fade.png', '/demo-homework-crop.png', '/demo-homework-beard.png']
    const number = Number(hw.lesson_number || hw.id || 1)
    return photos[Math.abs(number - 1) % photos.length]
  }

  const getChatFileUrl = (messageId) =>
    apiUrl(
      `/api/chats/messages/${encodeURIComponent(messageId)}/file?telegram_id=${encodeURIComponent(state.appUserId)}`,
    )

  const loadNotifications = async () => {
    state.notifications = { ...state.notifications, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(
        state.platform,
        `/api/notifications?telegram_id=${encodeURIComponent(state.appUserId)}&limit=40`,
      )
      state.notifications = {
        status: 'loaded',
        items: data.notifications || [],
        unread: Number(data.unread_count || 0),
        error: '',
      }
      render()
      // отметить прочитанными, чтобы колокольчик погас
      await apiPost(state.platform, '/api/notifications/read', {
        telegram_id: state.appUserId,
        read_all: true,
      }).catch(() => {})
      await refreshSessionQuiet()
    } catch (e) {
      state.notifications = { status: 'error', items: [], unread: 0, error: e?.message || 'Не удалось загрузить' }
      render()
    }
  }

  const refreshSessionQuiet = async () => {
    try {
      const session = await apiGet(state.platform, `/api/session?telegram_id=${encodeURIComponent(state.appUserId)}`)
      state.session = session
      if (session?.vk_account_linked) {
        state.vkLinkGenerate = { loading: false, token: null, expiresAt: null, error: '' }
      }
      render()
    } catch {
      // ignore
    }
  }

  const getGuestHomeworkFileUrl = (homeworkId, preview = false) =>
    apiUrl(`/api/guest/homeworks/${encodeURIComponent(homeworkId)}/file${preview ? '?preview=1' : ''}`)

  const getGuestHomeworkAttachmentFileUrl = (homeworkId, attachmentId, preview = false) =>
    apiUrl(
      `/api/guest/homeworks/${encodeURIComponent(homeworkId)}/attachments/${encodeURIComponent(attachmentId)}/file${preview ? '?preview=1' : ''}`,
    )

  const loadGuestPortfolio = async () => {
    state.guestPortfolio = { ...state.guestPortfolio, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(state.platform, '/api/guest/portfolio-students')
      state.guestPortfolio = {
        status: 'loaded',
        students: data.students || [],
        error: '',
      }
      render()
    } catch (e) {
      state.guestPortfolio = { status: 'error', students: [], error: e?.message || 'Ошибка загрузки' }
      render()
    }
  }

  const loadGuestStudentPortfolio = async (studentId) => {
    state.guestStudentProfile = { ...state.guestStudentProfile, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(state.platform, `/api/guest/students/${encodeURIComponent(studentId)}/portfolio`)
      state.guestStudentProfile = {
        status: 'loaded',
        student: data.student || null,
        homeworks: data.homeworks || [],
        error: '',
      }
      render()
    } catch (e) {
      state.guestStudentProfile = {
        status: 'error',
        student: null,
        homeworks: [],
        error: e?.message || 'Ошибка',
      }
      render()
    }
  }

  const loadStudentHomeworks = async () => {
    state.studentHomeworks = { ...state.studentHomeworks, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(state.platform, `/api/student/homeworks?telegram_id=${encodeURIComponent(state.appUserId)}`)
      state.studentHomeworks = {
        status: 'loaded',
        items: data.homeworks || [],
        avg: data.average_rating ?? null,
        count: data.ratings_count ?? 0,
        error: '',
      }
      render()
    } catch (e) {
      state.studentHomeworks = { status: 'error', items: [], avg: null, count: 0, error: e?.message || 'Ошибка' }
      render()
    }
  }

  const loadChatMessages = async (studentId) => {
    const key = String(studentId)
    state.chats = { ...state.chats, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(
        state.platform,
        `/api/chats/messages?telegram_id=${encodeURIComponent(state.appUserId)}&student_id=${encodeURIComponent(key)}&limit=200`,
      )
      const map = new Map(state.chats.messagesByStudentId)
      map.set(key, data.messages || [])
      state.chats = { ...state.chats, status: 'loaded', messagesByStudentId: map, error: '' }
      render()
      setTimeout(() => {
        const el = document.getElementById('chat-scroll')
        if (el) el.scrollTop = el.scrollHeight
      }, 50)
    } catch (e) {
      state.chats = { ...state.chats, status: 'error', error: e?.message || 'Ошибка' }
      render()
    }
  }

  const sendChatMessage = async (studentId) => {
    const inp = document.getElementById('chat-input')
    const t = inp?.value?.trim()
    if (!t) return
    inp.value = ''
    try {
      const fd = new FormData()
      fd.append('telegram_id', String(state.appUserId))
      fd.append('student_id', String(studentId))
      fd.append('text_content', t)
      const r = await fetch(apiUrl('/api/chats/messages'), {
        method: 'POST',
        cache: 'no-store',
        headers: (() => {
          const h = buildHeaders(state.platform)
          delete h['Content-Type']
          return h
        })(),
        body: fd,
      })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка запроса (${r.status}).`)
      await loadChatMessages(studentId)
      await refreshSessionQuiet()
    } catch (e) {
      toast(root, e?.message || 'Не удалось отправить')
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const submitHomework = async () => {
    if (state.hwSubmit.status !== 'idle' || state.hwSubmitInFlight) return

    const isBonus = Boolean(document.getElementById('hw-bonus')?.checked)
    const numRaw = document.getElementById('hw-num')?.value?.trim()
    const title = document.getElementById('hw-title')?.value?.trim()
    const desc = document.getElementById('hw-desc')?.value?.trim()
    const draftItems = state.hwNewDraft?.items || []

    if (!numRaw || !title || !desc) {
      toast(root, 'Заполните номер задания, название и описание')
      return
    }
    if (!isBonus) {
      const lessonNum = Number(numRaw)
      if (!Number.isInteger(lessonNum) || lessonNum <= 0) {
        toast(root, 'Номер задания — целое число больше нуля')
        return
      }
      const maxLessons = state.session?.student?.lessons_count
      if (maxLessons != null && lessonNum > maxLessons) {
        toast(root, `Урок №${lessonNum} недоступен. По вашей программе ${maxLessons} уроков.`)
        return
      }
    }
    if (!draftItems.length) {
      toast(root, 'Добавьте хотя бы одно фото работы')
      return
    }
    if (draftItems.length > 5) {
      toast(root, 'Можно не более 5 фотографий')
      return
    }

    const fd = new FormData()
    fd.append('telegram_id', String(state.appUserId))
    fd.append('is_bonus', isBonus ? '1' : '0')
    if (!isBonus) fd.append('lesson_number', String(Number(numRaw)))
    fd.append('haircut_name', title)
    fd.append('text_content', desc)
    for (const it of draftItems) {
      if (it.file) fd.append('file', it.file, it.file.name || 'photo.jpg')
    }

    state.hwSubmitInFlight = true
    let uploadTimeoutId = null
    try {
      state.hwSubmit = { status: 'loading', error: '' }
      state.hwSubmitAborted = false
      const ctrl = new AbortController()
      state._hwSubmitAbort = () => ctrl.abort()
      uploadTimeoutId = setTimeout(() => ctrl.abort(), 15 * 60 * 1000)
      render()

      const r = await fetch(apiUrl('/api/homeworks'), {
        method: 'POST',
        cache: 'no-store',
        headers: (() => {
          const h = buildHeaders(state.platform)
          delete h['Content-Type']
          return h
        })(),
        body: fd,
        signal: ctrl.signal,
      })
      const payload = await r.json().catch(() => ({}))
      if (r.status === 413) {
        throw new Error(payload?.error || 'Файл слишком большой.')
      }
      if (r.status === 409) {
        throw new Error(payload?.error || 'Эта работа уже отправлена на проверку.')
      }
      if (!r.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Ошибка запроса (${r.status}).`)
      }

      state._hwSubmitAbort = null
      state.hwSubmit = { status: 'success', error: '' }
      state.hwNewDraft = { items: [] }
      render()
      await sleep(1400)
      state.hwSubmit = { status: 'idle', error: '' }
      back()
      await loadStudentHomeworks()
      await refreshSessionQuiet()
    } catch (e) {
      state._hwSubmitAbort = null
      const aborted = e?.name === 'AbortError' || state.hwSubmitAborted
      if (aborted) {
        state.hwSubmitAborted = false
        state.hwSubmit = { status: 'idle', error: '' }
        render()
        return
      }
      state.hwSubmit = { status: 'error', error: e?.message || 'Не удалось отправить' }
      render()
    } finally {
      if (uploadTimeoutId) clearTimeout(uploadTimeoutId)
      state.hwSubmitInFlight = false
    }
  }

  const loadTeacherStudents = async () => {
    state.teacherStudents = { ...state.teacherStudents, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(state.platform, `/api/teacher/students?telegram_id=${encodeURIComponent(state.appUserId)}`)
      state.teacherStudents = { status: 'loaded', items: data.students || [], error: '' }
      render()
    } catch (e) {
      state.teacherStudents = { status: 'error', items: [], error: e?.message || 'Ошибка' }
      render()
    }
  }

  const loadTeacherDashboard = async () => {
    state.teacherDashboard = { ...state.teacherDashboard, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(state.platform, `/api/teacher/dashboard?telegram_id=${encodeURIComponent(state.appUserId)}`)
      state.teacherDashboard = { status: 'loaded', data, error: '' }
      render()
    } catch (e) {
      state.teacherDashboard = { status: 'error', data: null, error: e?.message || 'Ошибка' }
      render()
    }
  }

  const loadTeacherStudentHomeworks = async (studentId) => {
    state.teacherStudentHomeworks = { ...state.teacherStudentHomeworks, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(
        state.platform,
        `/api/teacher/student-homeworks?telegram_id=${encodeURIComponent(state.appUserId)}&student_id=${encodeURIComponent(studentId)}&include_reviewed=true`,
      )
      state.teacherStudentHomeworks = {
        status: 'loaded',
        student: data.student || null,
        items: data.homeworks || [],
        error: '',
      }
      render()
    } catch (e) {
      state.teacherStudentHomeworks = { status: 'error', student: null, items: [], error: e?.message || 'Ошибка' }
      render()
    }
  }

  const updateHwSubmitBtn = () => {
    const starsEl = document.getElementById('hw-stars')
    const rating = starsEl ? Number(starsEl.dataset.rating) || 0 : 0
    const comment = document.getElementById('hw-comment')?.value?.trim() || ''
    const btn = document.getElementById('hw-submit-btn')
    if (!btn) return
    if (rating > 0) {
      btn.textContent = 'Принять'
      btn.disabled = false
      btn.style.opacity = '1'
      btn.style.cursor = 'pointer'
    } else if (comment.length > 0) {
      btn.textContent = 'Отправить комментарий'
      btn.disabled = false
      btn.style.opacity = '1'
      btn.style.cursor = 'pointer'
    } else {
      btn.textContent = 'Принять'
      btn.disabled = true
      btn.style.opacity = '.4'
      btn.style.cursor = 'not-allowed'
    }
  }

  const saveHwGradeInline = async (homeworkId) => {
    const starsEl = document.getElementById('hw-stars')
    const rating = starsEl ? Number(starsEl.dataset.rating) || null : null
    const comment = document.getElementById('hw-comment')?.value?.trim() || null
    if (!rating && !comment) {
      toast(root, 'Укажите оценку или напишите комментарий')
      return
    }
    try {
      await apiPost(state.platform, '/api/teacher/review', {
        telegram_id: state.appUserId,
        homework_id: homeworkId,
        rating: rating ?? undefined,
        comment: comment ?? undefined,
      })
      toast(root, rating ? 'Задание принято' : 'Комментарий сохранён')
      if (state.adminStudentProfile.student?.id) {
        await loadAdminStudentProfile(state.adminStudentProfile.student.id)
      }
      if (state.teacherStudentHomeworks.student?.id) {
        await loadTeacherStudentHomeworks(state.teacherStudentHomeworks.student.id)
      }
      if (state.session?.student?.id) {
        await loadStudentHomeworks()
      }
      const refreshed = (state.studentHomeworks.items || []).find((x) => Number(x.id) === Number(homeworkId))
      if (refreshed) state.selectedHomework = refreshed
      await refreshSessionQuiet()
      render()
    } catch (e) {
      toast(root, e?.message || 'Ошибка')
    }
  }

  const addHomeworkComment = async (homeworkId) => {
    const text = document.getElementById('hw-thread-comment')?.value?.trim() || ''
    if (!text) {
      toast(root, 'Напишите комментарий')
      return
    }
    try {
      await apiPost(state.platform, `/api/homeworks/${encodeURIComponent(homeworkId)}/comments`, {
        telegram_id: state.appUserId,
        text_content: text,
      })
      if (state.teacherStudentHomeworks.student?.id) {
        await loadTeacherStudentHomeworks(state.teacherStudentHomeworks.student.id)
        const refreshed = (state.teacherStudentHomeworks.items || []).find((item) => Number(item.id) === Number(homeworkId))
        if (refreshed) state.selectedHomework = refreshed
      } else if (state.session?.student?.id) {
        await loadStudentHomeworks()
        const refreshed = (state.studentHomeworks.items || []).find((item) => Number(item.id) === Number(homeworkId))
        if (refreshed) state.selectedHomework = refreshed
      }
      toast(root, 'Комментарий отправлен')
      render()
    } catch (error) { toast(root, error?.message || 'Не удалось отправить комментарий') }
  }

  const submitStudentHwRevision = async (homeworkId) => {
    const txt = document.getElementById('hw-correction')?.value?.trim()
    if (!txt) {
      toast(root, 'Опишите исправление')
      return
    }
    const inp = document.getElementById('hw-correction-file')
    const file = inp?.files?.[0] || null
    const fd = new FormData()
    fd.append('telegram_id', String(state.appUserId))
    fd.append('revision_text', txt)
    if (file) fd.append('file', file, file.name)
    try {
      const r = await fetch(apiUrl(`/api/student/homeworks/${encodeURIComponent(homeworkId)}/revision`), {
        method: 'POST',
        cache: 'no-store',
        headers: (() => {
          const h = buildHeaders(state.platform)
          delete h['Content-Type']
          return h
        })(),
        body: fd,
      })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка запроса (${r.status}).`)
      toast(root, 'Исправление отправлено')
      await loadStudentHomeworks()
      const refreshed = (state.studentHomeworks.items || []).find((x) => Number(x.id) === Number(homeworkId))
      if (refreshed) state.selectedHomework = refreshed
      await refreshSessionQuiet()
      render()
    } catch (e) {
      toast(root, e?.message || 'Не удалось отправить')
    }
  }

  const openHwFromNotif = async (notificationId, homeworkIdArg) => {
    const nid = Number(notificationId)
    if (Number.isFinite(nid) && nid > 0) {
      await apiPost(state.platform, '/api/notifications/read', {
        telegram_id: state.appUserId,
        notification_id: nid,
      }).catch(() => {})
    }
    await refreshSessionQuiet()
    const n = (state.notifications.items || []).find((x) => Number(x.id) === nid)
    const p = n?.payload && typeof n.payload === 'object' ? n.payload : {}
    const fromArg = homeworkIdArg != null && homeworkIdArg !== '' ? Number(homeworkIdArg) : NaN
    const fromPayload = p.homework_id != null ? Number(p.homework_id) : NaN
    const hwIdRaw = Number.isFinite(fromArg) && fromArg > 0 ? fromArg : fromPayload
    const hwId = Number.isInteger(hwIdRaw) && hwIdRaw > 0 ? hwIdRaw : 0
    const stuRaw = p.student_id != null ? Number(p.student_id) : NaN
    const stuId = Number.isInteger(stuRaw) && stuRaw > 0 ? stuRaw : 0

    if (!hwId) {
      toast(root, 'Не удалось открыть задание')
      return
    }

    if (state.session?.student) {
      await loadStudentHomeworks()
      const hw = (state.studentHomeworks.items || []).find((x) => Number(x.id) === hwId)
      if (!hw) {
        toast(root, 'Работа не найдена')
        return
      }
      go('hw-view', { homework: hw })
      return
    }

    if (state.session?.isTeacher) {
      if (!stuId) {
        toast(root, 'Нет данных об ученике')
        return
      }
      const row = (state.teacherStudents.items || []).find((s) => Number(s.id) === stuId)
      state.selectedStudent = { id: stuId, full_name: row?.full_name || 'Ученик' }
      await loadTeacherStudentHomeworks(stuId)
      const stLoaded = state.teacherStudentHomeworks.student
      if (stLoaded?.full_name) state.selectedStudent = { id: stuId, full_name: stLoaded.full_name }
      const hw = (state.teacherStudentHomeworks.items || []).find((x) => Number(x.id) === hwId)
      if (!hw) {
        toast(root, 'Работа не найдена')
        return
      }
      go('hw-view', { homework: hw })
      return
    }

    if (state.session?.isAdmin) {
      if (!stuId) {
        toast(root, 'Нет данных об ученике')
        return
      }
      await loadAdminStudentProfile(stuId)
      const hw = (state.adminStudentProfile.homeworks || []).find((x) => Number(x.id) === hwId)
      if (!hw) {
        toast(root, 'Работа не найдена')
        return
      }
      go('hw-view', { homework: hw })
    }
  }

  const loadAdminModeration = async () => {
    state.adminModeration = { ...state.adminModeration, status: 'loading', error: '' }
    state.adminTeacherApplications = { ...state.adminTeacherApplications, status: 'loading', error: '' }
    state.adminProfileEdits = { ...state.adminProfileEdits, status: 'loading', error: '' }
    render()
    try {
      const [stuData, taData, teachersData, peData] = await Promise.all([
        apiGet(
          state.platform,
          `/api/admin/students?telegram_id=${encodeURIComponent(state.appUserId)}&status=moderation`,
        ),
        apiGet(
          state.platform,
          `/api/admin/teacher-applications?telegram_id=${encodeURIComponent(state.appUserId)}`,
        ),
        apiGet(state.platform, `/api/admin/teachers?telegram_id=${encodeURIComponent(state.appUserId)}`),
        apiGet(state.platform, `/api/admin/profile-edits?telegram_id=${encodeURIComponent(state.appUserId)}`),
      ])
      state.adminModeration = { status: 'loaded', items: stuData.students || [], error: '' }
      state.adminTeacherApplications = { status: 'loaded', items: taData.applications || [], error: '' }
      state.adminTeachers = { status: 'loaded', items: teachersData.teachers || [], error: '' }
      state.adminProfileEdits = { status: 'loaded', items: peData.edits || [], error: '' }
      render()
    } catch (e) {
      state.adminModeration = { status: 'error', items: [], error: e?.message || 'Ошибка' }
      state.adminTeacherApplications = { status: 'error', items: [], error: e?.message || 'Ошибка' }
      state.adminProfileEdits = { status: 'error', items: [], error: e?.message || 'Ошибка' }
      render()
    }
  }

  const adminSetStudentStatus = async (studentId, action, teacher_ids) => {
    try {
      const body = {
        telegram_id: state.appUserId,
        student_id: studentId,
        action,
      }
      if (action === 'approve' && teacher_ids && teacher_ids.length) {
        body.teacher_ids = teacher_ids
      }
      await apiPost(state.platform, '/api/admin/students', body)
      toast(root, 'Готово')
      await loadAdminModeration()
      await refreshSessionQuiet()
    } catch (e) {
      toast(root, e?.message || 'Ошибка')
    }
  }

  const loadAdminStudents = async () => {
    state.adminStudents = { ...state.adminStudents, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(state.platform, `/api/admin/students?telegram_id=${encodeURIComponent(state.appUserId)}`)
      state.adminStudents = { status: 'loaded', items: data.students || [], error: '' }
      render()
    } catch (e) {
      state.adminStudents = { status: 'error', items: [], error: e?.message || 'Ошибка' }
      render()
    }
  }

  const loadAdminTeachers = async () => {
    state.adminTeachers = { ...state.adminTeachers, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(state.platform, `/api/admin/teachers?telegram_id=${encodeURIComponent(state.appUserId)}`)
      state.adminTeachers = { status: 'loaded', items: data.teachers || [], error: '' }
      render()
    } catch (e) {
      state.adminTeachers = { status: 'error', items: [], error: e?.message || 'Ошибка' }
      render()
    }
  }

  const loadAdminStudentProfile = async (studentId) => {
    state.adminStudentProfile = { ...state.adminStudentProfile, status: 'loading', error: '' }
    render()
    try {
      const data = await apiGet(
        state.platform,
        `/api/admin/student/${encodeURIComponent(studentId)}?telegram_id=${encodeURIComponent(state.appUserId)}`,
      )
      state.adminStudentProfile = {
        status: 'loaded',
        student: data.student || null,
        homeworks: data.homeworks || [],
        error: '',
      }
      render()
    } catch (e) {
      state.adminStudentProfile = { status: 'error', student: null, homeworks: [], error: e?.message || 'Ошибка' }
      render()
    }
  }

  const submitAdminStudentInline = async (studentId) => {
    const sid = Number(studentId)
    const lessonsRaw = document.getElementById(`aas-lessons-${sid}`)?.value?.trim()
    const track = document.getElementById(`aas-track-${sid}`)?.value
    const cbs = document.querySelectorAll(`input.aas-cb-${sid}`)
    const teacher_ids = track === 'barber' ? [] : [...cbs].filter((c) => c.checked).map((c) => Number(c.value))
    try {
      await apiPost(state.platform, '/api/admin/update-student', {
        telegram_id: state.appUserId,
        student_id: sid,
        lessons_count: lessonsRaw === '' || lessonsRaw === undefined ? undefined : Number(lessonsRaw),
        student_track: track || undefined,
        teacher_ids,
      })
      toast(root, track === 'barber' ? 'Барбер: привязка к преподавателям снята' : 'Сохранено')
      state.adminEditOpenId = null
      await loadAdminStudents()
      await refreshSessionQuiet()
    } catch (e) {
      toast(root, e?.message || 'Ошибка')
    }
  }

  const tabBar = (tabs, active) =>
    `<div class="tab">${tabs
      .map(
        (t) => `
      <button class="tb${t.k === active ? ' on' : ''}" onclick="window.__ba_setTab('${t.k}')">
        <span style="position:relative">${t.i || ''}${t.c > 0 ? `<span class="dot">${t.c}</span>` : ''}</span>${esc(t.l)}
      </button>`,
      )
      .join('')}</div>`

  const cardEmpty = (txt) => `<p class="empty">${esc(txt)}</p>`

  const badge = (txt, color = 'var(--gold)') =>
    `<span class="badge" style="background:rgba(201,162,39,.12);color:${color};border:1px solid rgba(201,162,39,.25)">${esc(txt)}</span>`

  const renderVkBindCardHtml = () => {
    if (state.platform?.platform !== 'vk') return ''
    const vkLinkIco =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#080808" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#080808" stroke-width="2" stroke-linecap="round"/></svg>'
    return `<div style="width:100%;max-width:300px;margin:0 auto 10px;box-sizing:border-box;border-radius:16px;border:1.5px solid var(--gold);background:linear-gradient(135deg,rgba(201,162,39,.2) 0%,rgba(201,162,39,.06) 100%);box-shadow:0 0 18px rgba(201,162,39,.18),inset 0 1px 0 rgba(201,162,39,.15);padding:14px 18px">
      <div style="display:flex;align-items:flex-start;gap:14px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 12px rgba(201,162,39,.5)">${vkLinkIco}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800;color:var(--gold);font-family:var(--font-body);letter-spacing:1.5px;text-transform:uppercase;line-height:1.2">Код из Telegram</div>
          <p style="font-size:11px;color:rgba(201,162,39,.6);font-family:var(--font-body);margin-top:4px;line-height:1.45;letter-spacing:.3px">
            В Telegram: профиль → «Сгенерировать код для VK», затем введите 4 цифры здесь.
          </p>
          <input class="inp" id="vk-bind-code" maxlength="4" inputmode="numeric" autocomplete="one-time-code" placeholder="0000" style="margin-top:10px;margin-bottom:8px;text-align:center;font-size:20px;letter-spacing:8px;font-weight:800;font-variant-numeric:tabular-nums;background:rgba(8,8,8,.35);border:1.5px solid rgba(201,162,39,.35);color:var(--gold)">
          <button type="button" class="btn bf btn-w" style="width:100%" onclick="window.__ba_confirmVkBind()">Привязать и войти</button>
        </div>
      </div>
    </div>`
  }

  const renderVkLinkTelegramCard = () => {
    if (state.platform?.platform !== 'telegram' || !state.session?.hasUser) return ''
    const linked = Boolean(state.session?.vk_account_linked)
    const g = state.vkLinkGenerate
    const codeBlock =
      g.token &&
      `<div style="text-align:center;margin-top:12px;padding:14px;background:rgba(201,162,39,.08);border-radius:14px;border:1px solid var(--border)">
      <div style="font-size:28px;font-weight:900;letter-spacing:10px;font-variant-numeric:tabular-nums;color:var(--gold);font-family:var(--font-body)">${esc(g.token)}</div>
      ${g.expiresAt ? `<div style="font-size:10px;color:var(--dim);margin-top:8px;font-family:var(--font-body)">Действует до ${esc(g.expiresAt)}</div>` : ''}
      <p style="font-size:10px;color:var(--dim);margin-top:10px;line-height:1.4;font-family:var(--font-body)">В VK открой это <a href="https://vk.com/app54558405" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">ПРИЛОЖЕНИЕ 👈</a> и введи код на экране входа.</p>
    </div>`
    if (linked) {
      return `<div class="card" style="margin-bottom:12px;border-color:rgba(58,170,58,.35)">
      <div style="font-size:11px;font-weight:700;color:var(--success);font-family:var(--font-body)">VK подключён</div>
      <p style="font-size:11px;color:var(--dim);margin-top:6px;line-height:1.45;font-family:var(--font-body)">Этот аккаунт можно открывать из VK Mini App.</p>
    </div>`
    }
    return `<div class="card" style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px;font-family:var(--font-body);text-transform:uppercase">Вход из VK</div>
      <p style="font-size:11px;color:var(--dim);line-height:1.45;margin-bottom:10px;font-family:var(--font-body)">
        Сгенерируйте 4-значный код и введите его в приложении VK, чтобы войти в этот же аккаунт.
      </p>
      ${g.error ? `<p style="font-size:11px;color:var(--danger);margin-bottom:8px;font-family:var(--font-body)">${esc(g.error)}</p>` : ''}
      <button type="button" class="btn bf btn-w" onclick="window.__ba_generateVkLinkCode()" ${g.loading ? 'disabled style="opacity:.6"' : ''}>${g.loading ? 'Генерация…' : 'Сгенерировать код для VK'}</button>
      ${codeBlock || ''}
    </div>`
  }

  const generateVkLinkCode = async () => {
    state.vkLinkGenerate = { ...state.vkLinkGenerate, loading: true, error: '' }
    render()
    try {
      const data = await apiPost(state.platform, '/api/account/vk-link-token', { telegram_id: state.appUserId })
      state.vkLinkGenerate = {
        loading: false,
        token: data.token ?? null,
        expiresAt: data.expires_at ?? null,
        error: '',
      }
      render()
    } catch (e) {
      state.vkLinkGenerate = {
        loading: false,
        token: null,
        expiresAt: null,
        error: e?.message || 'Не удалось создать код',
      }
      render()
    }
  }

  const confirmVkBind = async () => {
    const raw = document.getElementById('vk-bind-code')?.value?.trim() || ''
    const token = raw.replace(/\D/g, '').slice(0, 4)
    if (token.length !== 4) {
      toast(root, 'Введите 4 цифры кода из Telegram')
      return
    }
    try {
      await apiPost(state.platform, '/api/account/vk-link-confirm', {
        telegram_id: state.appUserId,
        token,
      })
      toast(root, 'Аккаунт привязан')
      go('loading')
      await bootstrap()
    } catch (e) {
      toast(root, e?.message || 'Не удалось привязать')
    }
  }

  const renderNotifs = () => {
    const ns = state.notifications.items || []
    if (!ns.length) return cardEmpty('Нет уведомлений')
    return `<div style="padding:12px">
      ${ns
        .map((n) => {
          const p = n.payload && typeof n.payload === 'object' ? n.payload : {}
          const hwIdNum = p.homework_id != null ? Number(p.homework_id) : NaN
          const stuIdNum = p.student_id != null ? Number(p.student_id) : NaN
          const hasHw = Number.isInteger(hwIdNum) && hwIdNum > 0
          const hasStu = Number.isInteger(stuIdNum) && stuIdNum > 0
          const isStud = Boolean(state.session?.student)
          const isTeach = Boolean(state.session?.isTeacher)
          const isAdm = Boolean(state.session?.isAdmin)
          const clickable = hasHw && (isStud || (isTeach && hasStu) || (isAdm && hasStu))
          const onclk = n.kind === 'feedback_invite' && isStud ? 'onclick="window.__ba_go(\'feedback\')"' : clickable ? `onclick="window.__ba_openHwFromNotif(${n.id},${hwIdNum})"` : ''
          const cur = clickable ? 'cursor:pointer;' : ''
          const unread = !n.read_at
          return `<div class="card" style="margin-bottom:8px;${cur}${unread ? 'border-left:3px solid var(--gold);box-shadow:0 0 14px rgba(201,162,39,.12)' : ''}" ${onclk}>
            <p style="font-size:12px;font-family:var(--font-body);line-height:1.5">${esc(n.body)}</p>
            ${clickable ? '<p style="font-size:9px;color:var(--gold);font-family:var(--font-body);margin-top:3px">Нажмите чтобы открыть →</p>' : ''}
            <p style="font-size:9px;color:var(--dim);font-family:var(--font-body);margin-top:3px">${esc(n.created_at)}</p>
          </div>`
        })
        .join('')}
    </div>`
  }

  const renderProfileEditModal = () => {
    const m = state.profileEditModal
    if (!m.open) return ''
    const st = state.session?.student
    const nameParts = String(st?.full_name || '').trim().split(' ')
    const prefillFn = esc(nameParts[0] || '')
    const prefillLn = esc(nameParts.slice(1).join(' ') || '')
    const prefillPhone = esc(st?.phone || '')
    const prefillMetro = esc(st?.metro || '')
    return `<div style="position:fixed;inset:0;z-index:6000;display:flex;align-items:flex-end;background:rgba(8,8,8,.75);backdrop-filter:blur(8px)" onclick="if(event.target===this)window.__ba_closeProfileEdit()">
      <div style="background:var(--card);border-radius:22px 22px 0 0;padding:22px 18px 32px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 -4px 40px rgba(0,0,0,.5)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
          <h3 style="margin:0;font-size:16px;font-weight:700">Редактировать профиль</h3>
          <button type="button" onclick="window.__ba_closeProfileEdit()" style="background:none;border:none;color:var(--dim);font-size:22px;cursor:pointer;padding:0;line-height:1">×</button>
        </div>
        <p style="font-size:11px;color:var(--dim);font-family:var(--font-body);margin-bottom:16px;line-height:1.5">Изменения вступят в силу после одобрения администратором.</p>
        <input class="inp" id="pe-fn" placeholder="Имя *" value="${prefillFn}" style="margin-bottom:8px">
        <input class="inp" id="pe-ln" placeholder="Фамилия *" value="${prefillLn}" style="margin-bottom:8px">
        <input class="inp" id="pe-phone" placeholder="Телефон *" value="${prefillPhone}" style="margin-bottom:8px">
        <input class="inp" id="pe-metro" placeholder="Станция метро" value="${prefillMetro}" style="margin-bottom:16px">
        ${m.error ? `<p style="color:var(--danger);font-size:11px;font-family:var(--font-body);margin-bottom:10px">${esc(m.error)}</p>` : ''}
        <button type="button" class="btn bf btn-w" ${m.busy ? 'disabled' : ''} onclick="window.__ba_submitProfileEdit()">
          ${m.busy ? 'Отправка…' : 'Отправить заявку'}
        </button>
      </div>
    </div>`
  }

  const renderStudent = () => {
    const t = state.tab || 'home'
    const unread = Number(state.session?.unread_notifications_count || 0)
    let content = ''
    if (t === 'home') {
      const st = state.session?.student
      const fullName = String(st?.full_name || '').trim() || 'Ученик'
      const ratingsCount = Number(st?.ratings_count || 0)
      const avg =
        st?.average_rating != null && ratingsCount > 0 ? Number(st.average_rating).toFixed(1) : '—'
      const teachers = Array.isArray(st?.teachers) ? st.teachers : []
      const teachersLine = teachers.map((x) => String(x.full_name || '').trim()).filter(Boolean).join(', ') || ''
      // Demo-only portraits keep local preview data separate from real user accounts.
      const isLocalDemoProfile = import.meta.env.DEV && Number(state.appUserId) === LOCAL_PREVIEW_USER_ID
      const demoAbout =
        'Я начинающий барбер. Люблю чистые формы, аккуратные переходы и постоянно развиваю технику. Моя цель — уверенно работать с мужскими стрижками и собрать сильное портфолио.'
      const teacherCards = teachers.length
        ? teachers
            .map(
              (teacher) => `<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:8px">
                <div style="position:relative;width:52px;height:52px;flex:0 0 52px;border-radius:50%;overflow:hidden;background:var(--gold-dim);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:15px;font-weight:800">
                  ${isLocalDemoProfile ? '<img src="/demo-teacher-barber.png" alt="Демонстрационный преподаватель" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' : `<img src="/academy-role-logo.jpg" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.25"><span style="position:relative">${esc(initialsFromName(teacher.full_name))}</span>`}
                </div>
                <div style="min-width:0;flex:1"><div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-bottom:3px;text-transform:uppercase;letter-spacing:.7px">Ваш преподаватель</div><div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(teacher.full_name || 'Преподаватель')}</div></div>
                <button type="button" class="btn bs" style="padding:8px 10px;flex-shrink:0" onclick="window.__ba_setTab('chat')">${ICO.chat}</button>
              </div>`,
            )
            .join('')
        : `<div class="card" style="padding:14px;color:var(--dim);font-family:var(--font-body);font-size:11px">Преподаватель будет назначен после модерации.</div>`

      const avatarUrl = apiUrl(`/api/student/me/avatar?telegram_id=${encodeURIComponent(state.appUserId)}`)
      content =
        `<div class="scr fi" style="padding:0 0 14px">
          <div class="fi" style="padding:0">
            <section style="position:relative;min-height:340px;overflow:hidden;background:linear-gradient(145deg,#211d15 0%,#080808 72%);border-radius:0 0 28px 28px;cursor:pointer" onclick="window.__ba_changeAvatar()" title="Нажмите, чтобы изменить фото">
              ${isLocalDemoProfile ? '<img src="/demo-student-barber.png" alt="Демонстрационный ученик" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' : st?.has_avatar ? `<img data-auth-src="${avatarUrl}" src="" alt="Фото ${esc(fullName)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : `<img src="/academy-role-logo.jpg" alt="MADCAP Academy" style="position:absolute;inset:0;margin:auto;width:150px;height:150px;object-fit:cover;border-radius:50%;opacity:.32;filter:grayscale(.2)">`}
              <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.06) 26%,rgba(0,0,0,.82) 100%)"></div>
              <img src="/academy-role-logo.jpg" alt="MADCAP Academy" style="position:absolute;top:16px;left:16px;width:44px;height:44px;object-fit:cover;border-radius:50%;border:1px solid rgba(255,255,255,.65);box-shadow:0 4px 15px rgba(0,0,0,.28)">
              <button type="button" class="hdr-btn" style="position:absolute;top:14px;right:54px;color:#fff;background:rgba(255,255,255,.15);backdrop-filter:blur(8px);border-radius:50%" onclick="event.stopPropagation();window.__ba_toggleTheme()">◐</button><button type="button" class="hdr-btn" style="position:absolute;top:14px;right:14px;color:#fff;background:rgba(255,255,255,.15);backdrop-filter:blur(8px);border-radius:50%" onclick="event.stopPropagation();window.__ba_logout()">${ICO.logout}</button>
              <div style="position:absolute;left:20px;right:20px;bottom:72px;color:#fff">
                <div style="font-size:10px;font-family:var(--font-body);letter-spacing:1.4px;text-transform:uppercase;opacity:.8;margin-bottom:7px">MADCAP ACADEMY · УЧЕНИК</div>
                <h1 style="margin:0;font-size:29px;line-height:1.05;font-weight:650;letter-spacing:-.6px">${esc(fullName)}</h1>
                <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${badge(studentStatusRu(st?.status))}${badge(studentTrackRu(st?.student_track || 'student'))}</div>
              </div>
              <span style="position:absolute;right:18px;bottom:18px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.9);color:#1a1712;font-size:14px">✎</span>
            </section>
            <div class="card" style="position:relative;margin:-48px 14px 12px;border-radius:22px;box-shadow:0 12px 28px rgba(0,0,0,.22)">
              <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
                <div><div class="stat-label">Занятий</div><div class="stat-val">${esc(st?.lessons_count ?? '—')}</div></div>
                <div><div class="stat-label">Ср. балл</div><div class="stat-val">${esc(avg)}</div></div>
                <div><div class="stat-label">Метро</div><div class="stat-val" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(st?.metro || 'Не указано')}">${esc(st?.metro || '—')}</div></div>
                ${
                  teachersLine
                    ? `<div style="grid-column:span 3"><div class="stat-label">Преподавател${teachers.length > 1 ? 'и' : 'ь'}</div><div style="font-size:13px;font-family:var(--font-body)">${esc(teachersLine)}</div></div>`
                    : ''
                }
              </div>
            </div>
          </div>
          <div style="padding:0 14px">
          ${renderVkLinkTelegramCard()}
          <button type="button" class="btn bs btn-w" style="margin-bottom:14px" onclick="window.__ba_openProfileEdit()">Редактировать профиль</button>
          <section class="card" style="margin-bottom:14px;padding:18px">
            <h4 style="font-size:19px;font-weight:650;color:var(--text);margin:0 0 8px">Обо мне</h4>
            <p style="margin:0;color:var(--dim);font-family:var(--font-body);font-size:12px;line-height:1.65">${esc(st?.about_me || (isLocalDemoProfile ? demoAbout : 'Расскажите немного о себе в разделе «Профиль».'))}</p>
          </section>
          <section class="card" style="margin-bottom:18px;padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div><h4 style="font-size:17px;font-weight:650;color:var(--gold);margin:0">Мои работы</h4><p style="margin:3px 0 0;color:var(--dim);font-family:var(--font-body);font-size:10px">Домашние задания и результаты обучения</p></div>
            <button class="btn bs" onclick="window.__ba_go('hw-new')">＋ ДЗ</button>
          </div>
          ${renderStudentHomeworksList({ limit: 3 })}
          ${(state.studentHomeworks.items || []).length > 3 ? '<button type="button" class="btn bs btn-w" style="margin-top:12px" onclick="window.__ba_setTab(&quot;works&quot;)">Показать все работы</button>' : ''}
          </section>
          <section class="card" style="margin-top:0;padding:18px">
            <div style="display:flex;justify-content:space-between;align-items:end;margin-bottom:10px"><div><h4 style="font-size:17px;font-weight:650;color:var(--gold);margin:0">Мой преподаватель</h4><p style="margin:3px 0 0;color:var(--dim);font-family:var(--font-body);font-size:10px">Задавайте вопросы и получайте обратную связь</p></div></div>
            ${teacherCards}
          </section>
          </div>
        </div>`
    } else if (t === 'works') {
      content =
        hdr('Мои работы', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_go('hw-new')">＋</button>`) +
        `<div class="scr fi" style="padding:14px"><p style="margin:0 0 14px;color:var(--dim);font-family:var(--font-body);font-size:11px;line-height:1.5">Нажмите на работу, чтобы увидеть фотографии, описание, статус и комментарий преподавателя.</p>${renderStudentHomeworksList()}<button type="button" class="btn bf btn-w" style="margin-top:16px" onclick="window.__ba_go('hw-new')">＋ Добавить домашнее задание</button></div>`
    } else if (t === 'notifs') {
      content =
        hdr('Уведомления', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr" style="padding:12px">${renderVkLinkTelegramCard()}${renderNotifs()}</div>`
    } else if (t === 'chat') {
      content =
        hdr('Чат', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        renderChatScreen()
    } else if (t === 'profile') {
      const st = state.session?.student
      content =
        hdr('Профиль', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr fi" style="padding:14px"><div class="card"><div class="stat-label">Имя</div><div style="font-size:17px;font-weight:700;margin-bottom:14px">${esc(st?.full_name || '—')}</div><div class="stat-label">Метро</div><div style="font-size:14px;margin-bottom:14px">${esc(st?.metro || 'Не указано')}</div><div class="stat-label">Телефон</div><div style="font-size:14px">${esc(st?.phone || '—')}</div></div><section class="card" style="margin-top:14px"><h3 style="margin:0 0 8px;font-size:18px">Обо мне</h3><textarea class="inp" id="about-me" rows="5" maxlength="1000" placeholder="Расскажите немного о себе…">${esc(st?.about_me || '')}</textarea><button type="button" class="btn bf btn-w" style="margin-top:10px" onclick="window.__ba_saveAbout()">Сохранить</button></section><button type="button" class="btn bs btn-w" style="margin-top:14px" onclick="window.__ba_openProfileEdit()">Редактировать данные</button><button type="button" class="btn bs btn-w" style="margin-top:10px" onclick="window.__ba_toggleTheme()">Сменить тему</button></div>`
    }
    return (
      content +
      renderProfileEditModal() +
      tabBar(
        [
          { k: 'home', i: ICO.user, l: 'Главная' },
          { k: 'works', i: ICO.book, l: 'Работы' },
          { k: 'chat', i: ICO.chat, l: 'Чат' },
          { k: 'notifs', i: ICO.bell, l: 'Увед.', c: unread },
          { k: 'profile', i: ICO.gear, l: 'Профиль' },
        ],
        t,
      )
    )
  }

  const renderStudentHomeworksList = ({ limit = null } = {}) => {
    const st = state.studentHomeworks
    if (st.status === 'idle') return `<p class="empty">Загружаем…</p>`
    if (st.status === 'loading') return `<p class="empty">Загружаем…</p>`
    if (st.status === 'error') return `<p class="empty">${esc(st.error)}</p>`
    const items = st.items || []
    if (!items.length) return cardEmpty('Работ пока нет')
    const visibleItems = limit == null ? items : items.slice(0, limit)
    return `<div class="grid2">
      ${visibleItems
        .map((hw) => {
          const st = String(hw.status || '')
          const pending = st === 'pending'
          const revision = st === 'revision'
          const rejected = st === 'rejected'
          const title = hw.haircut_name || (hw.is_bonus ? 'Бонус' : `Урок #${hw.lesson_number ?? '—'}`)
          const badgeHtml = pending
            ? `<span class="badge" style="background:rgba(218,170,34,.1);color:var(--warn);border:1px solid rgba(218,170,34,.18);font-size:8px">На проверке</span>`
            : revision
              ? `<span class="badge" style="background:rgba(218,170,34,.12);color:var(--warn);border:1px solid rgba(218,170,34,.28);font-size:8px">На доработку</span>`
              : rejected
                ? `<span class="badge" style="background:rgba(218,68,68,.1);color:var(--danger);border:1px solid rgba(218,68,68,.22);font-size:8px">Отклонено</span>`
                : `<span class="badge" style="background:rgba(58,170,58,.12);color:var(--success);border:1px solid rgba(58,170,58,.22);font-size:8px">Проверено</span>`
          const lr = hw.latest_review
          const gradeHtml =
            !pending && !revision && lr?.status === 'approved' && lr.rating != null
              ? `<div style="display:flex;align-items:center;gap:2px;margin-top:3px;color:var(--gold)">${ICO.star}<span style="font-size:11px;font-weight:700;font-family:var(--font-body)">${esc(lr.rating)}</span></div>`
              : ''
          const { n: photoN, thumbUrl } = homeworkPortfolioPhotoMeta(hw)
          const demoThumbUrl = demoHomeworkPhotoUrl(hw)
          const thumbBlock = thumbUrl
            ? `<div style="position:relative"><img data-auth-src="${esc(thumbUrl)}" src="" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover">${photoN > 1 ? `<span style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.75);color:var(--gold);font-size:9px;font-weight:800;padding:3px 8px;border-radius:10px;font-family:var(--font-body);border:1px solid rgba(201,162,39,.25)">${photoN} фото</span>` : ''}</div>`
            : demoThumbUrl
              ? `<div style="position:relative"><img src="${demoThumbUrl}" alt="Демонстрационная работа: ${esc(title)}" style="width:100%;aspect-ratio:4/3;object-fit:cover"><span style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.75);color:var(--gold);font-size:9px;font-weight:800;padding:3px 8px;border-radius:10px;font-family:var(--font-body);border:1px solid rgba(201,162,39,.25)">фото</span></div>`
            : `<div style="width:100%;aspect-ratio:4/3;background:linear-gradient(135deg,rgba(201,162,39,.06) 0%,rgba(201,162,39,.02) 100%);display:flex;align-items:center;justify-content:center;color:var(--gold)">${ICO.scissors}</div>`
          return `<div class="card" style="cursor:pointer;padding:0;overflow:hidden" onclick="window.__ba_openHw(${hw.id})">
            ${thumbBlock}
            <div style="padding:8px">
              <div style="font-size:11px;font-weight:700;font-family:var(--font-body);margin-bottom:2px">${esc(title)}</div>
              <div style="font-size:9px;color:var(--dim);font-family:var(--font-body)">#${esc(hw.is_bonus ? 'бонус' : hw.lesson_number ?? '—')}</div>
              ${gradeHtml || `<div style="margin-top:6px">${badgeHtml}</div>`}
            </div>
          </div>`
        })
        .join('')}
    </div>`
  }

  const renderStudentWorks = () =>
    `${hdr('Мои работы', true, 'window.__ba_back()', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_go('hw-new')">＋</button>`)}
      <div class="scr fi" style="padding:14px">
        <p style="margin:0 0 14px;color:var(--dim);font-family:var(--font-body);font-size:11px;line-height:1.5">Все домашние задания: нажмите на работу, чтобы увидеть фото, описание, статус и комментарий преподавателя.</p>
        ${renderStudentHomeworksList()}
        <button type="button" class="btn bf btn-w" style="margin-top:16px" onclick="window.__ba_go('hw-new')">＋ Добавить домашнее задание</button>
      </div>`

  const renderHomeworkSubmitOverlay = () => {
    const s = state.hwSubmit
    if (s.status === 'idle') return ''
    if (s.status === 'loading') {
      return `<div style="position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,8,8,.86);backdrop-filter:blur(10px)">
      <div class="card" style="max-width:300px;width:100%;text-align:center;padding:28px 24px;border:1.5px solid var(--gold);background:linear-gradient(165deg,rgba(201,162,39,.14) 0%,rgba(8,8,8,.97) 45%);box-shadow:0 0 40px rgba(201,162,39,.18),inset 0 1px 0 rgba(201,162,39,.1)">
        <div class="ba-hw-submit-spin" style="margin-bottom:20px"></div>
        <p style="font-family:var(--font-body);font-size:15px;font-weight:800;color:var(--gold);letter-spacing:.5px;margin:0;text-transform:uppercase">Идёт отправка</p>
        <p style="font-size:11px;color:rgba(201,162,39,.55);margin-top:10px;line-height:1.5;font-family:var(--font-body)">Подождите несколько секунд</p>
      </div>
    </div>`
    }
    if (s.status === 'success') {
      return `<div style="position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,8,8,.86);backdrop-filter:blur(10px)">
      <div class="card" style="max-width:300px;width:100%;text-align:center;padding:30px 24px;border:1.5px solid rgba(58,170,58,.5);background:linear-gradient(165deg,rgba(58,170,58,.12) 0%,rgba(8,8,8,.97) 50%);box-shadow:0 0 32px rgba(58,170,58,.16)">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(58,170,58,.2);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;color:var(--success);border:1px solid rgba(58,170,58,.4)">${ICO.check}</div>
        <p style="font-family:var(--font-body);font-size:16px;font-weight:800;color:var(--success);margin:0;letter-spacing:.2px">Готово</p>
        <p style="font-size:11px;color:var(--dim);margin-top:10px;line-height:1.5;font-family:var(--font-body)">Задание отправлено на проверку</p>
      </div>
    </div>`
    }
    if (s.status === 'error') {
      return `<div style="position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,8,8,.86);backdrop-filter:blur(10px)">
      <div class="card" style="max-width:300px;width:100%;text-align:center;padding:26px 20px;border:1.5px solid rgba(218,68,68,.45);box-shadow:0 0 24px rgba(218,68,68,.1)">
        <p style="font-family:var(--font-body);font-size:15px;font-weight:800;color:var(--danger);margin:0">Не получилось</p>
        <p style="font-size:11px;color:var(--dim);margin-top:10px;line-height:1.5;font-family:var(--font-body)">${esc(s.error || 'Попробуйте ещё раз.')}</p>
        <button type="button" class="btn bf btn-w" style="margin-top:18px" onclick="window.__ba_dismissHwSubmit()">Закрыть</button>
      </div>
    </div>`
    }
    return ''
  }

  const homeworkPrimaryFileLabel = (hw) => {
    const ct = String(hw.content_type || '')
    if (ct === 'video') return 'Открыть видео'
    if (ct === 'document') return 'Открыть документ'
    return 'Открыть фото'
  }

  const attachmentFileLabel = (contentType, n) => {
    const ct = String(contentType || '')
    if (ct === 'video') return `Видео ${n}`
    if (ct === 'document') return `Документ ${n}`
    return `Фото ${n}`
  }

  /** Фотографии работы: сжатое превью для ленты и оригинал для открытия по тапу. */
  const homeworkPhotoItems = (hw, primaryUrl, attachmentUrl) => {
    const items = []
    if (hw.content_type === 'photo' && (hw.has_local_file || hw.has_telegram_file)) {
      items.push({ preview: primaryUrl(hw.id, true), full: primaryUrl(hw.id, false) })
    }
    const atts = Array.isArray(hw.attachments) ? hw.attachments : []
    atts.forEach((a) => {
      if (a.content_type === 'photo' && (a.has_local_file || a.has_telegram_file)) {
        items.push({ preview: attachmentUrl(hw.id, a.id, true), full: attachmentUrl(hw.id, a.id, false) })
      }
    })
    return items
  }

  /** Лента снимков с прокруткой; тап открывает оригинал. Общая для ученика, преподавателя и гостя. */
  const renderHomeworkPhotoStrip = (items) => {
    if (!items.length) return ''
    const width = items.length === 1 ? '100%' : '85%'
    const hint =
      items.length > 1
        ? `← листайте · ${items.length} фото · нажмите, чтобы открыть →`
        : 'нажмите, чтобы открыть'
    return `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:8px;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory">
        ${items
          .map(
            (it, i) =>
              `<img data-auth-src="${esc(it.preview)}" src="" alt="Фото ${i + 1}" onclick="window.__ba_openLightbox(${i})" style="width:${width};flex-shrink:0;border-radius:16px;border:1.5px solid var(--border);object-fit:cover;max-height:280px;scroll-snap-align:start;box-shadow:var(--glow);cursor:zoom-in">`,
          )
          .join('')}
      </div><div style="text-align:center;margin-bottom:12px"><span style="font-size:10px;color:var(--gold);font-family:var(--font-body);font-weight:700;letter-spacing:.5px">${esc(hint)}</span></div>`
  }

  /** При skipPhotos кнопки остаются только для файлов, которых нет в ленте: видео и документов. */
  const renderHomeworkMediaButtons = (hw, primaryUrl, attachmentUrl, { skipPhotos = false } = {}) => {
    const parts = []
    let n = 1
    if ((hw.has_local_file || hw.has_telegram_file) && !(skipPhotos && hw.content_type === 'photo')) {
      parts.push(
        `<button type="button" class="btn bf btn-w" onclick="window.__ba_openFile('${primaryUrl(hw.id)}')">${esc(homeworkPrimaryFileLabel(hw))}</button>`,
      )
    }
    n += 1
    const atts = Array.isArray(hw.attachments) ? hw.attachments : []
    atts.forEach((a) => {
      if ((a.has_local_file || a.has_telegram_file) && !(skipPhotos && a.content_type === 'photo')) {
        parts.push(
          `<button type="button" class="btn bs btn-w" onclick="window.__ba_openFile('${attachmentUrl(hw.id, a.id)}')">${esc(attachmentFileLabel(a.content_type, n))}</button>`,
        )
      }
      n += 1
    })
    if (!parts.length) return ''
    return `<div style="display:flex;flex-direction:column;gap:8px">${parts.join('')}</div>`
  }

  const renderHwNew = () => {
    const busy = state.hwSubmit.status !== 'idle'
    const items = state.hwNewDraft?.items || []
    const grid = items
      .map(
        (it, i) =>
          `<div style="position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;border:1.5px solid var(--border);box-shadow:var(--glow)">
      <img src="${esc(it.url)}" alt="" style="width:100%;height:100%;object-fit:cover">
      <button type="button" ${busy ? 'disabled' : ''} onclick="window.__ba_hwNewRemovePhoto(${i})" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.75);border:1px solid rgba(201,162,39,.3);color:var(--gold);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>
    </div>`,
      )
      .join('')
    return `${hdr('Новое задание', true, 'window.__ba_back()', '')}
    <div class="scr fi" style="padding:16px;${busy ? 'pointer-events:none;opacity:.55' : ''}">
      <div style="max-width:380px;margin:0 auto;display:flex;flex-direction:column;gap:10px">
        <div>
          <div style="font-size:10px;color:var(--dim);font-family:var(--font-body);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Фотографии работы</div>
          <div id="hw-photos-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px">${grid}</div>
          <label style="cursor:pointer">
            <div style="width:100%;height:80px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(201,162,39,.08) 0%,rgba(201,162,39,.02) 100%);border:2px dashed rgba(201,162,39,.25);border-radius:16px;color:var(--gold);flex-direction:column;gap:4px">
              ${ICO.camera}<span style="font-family:var(--font-body);font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Добавить фото</span>
            </div>
            <input type="file" accept="image/*" multiple style="display:none" ${busy ? 'disabled' : ''} onchange="window.__ba_hwNewAddPhotos(this)">
          </label>
        </div>
        <div style="margin-top:4px;padding-top:14px;border-top:1px solid rgba(201,162,39,.2)">
          <label style="font-family:var(--font-body);font-size:12px;color:var(--text);display:flex;align-items:center;gap:10px;cursor:pointer">
            <input id="hw-bonus" type="checkbox" style="width:18px;height:18px;accent-color:var(--gold);flex-shrink:0" ${busy ? 'disabled' : ''} onchange="window.__ba_hwNewBonusToggle()">
            <span>Бонусное задание <span style="color:var(--dim);font-size:11px">(номер урока не нужен)</span></span>
          </label>
        </div>
        <input class="inp" id="hw-num" placeholder="Номер задания (урока)" ${busy ? 'disabled' : ''}>
        <input class="inp" id="hw-title" placeholder="Название стрижки" ${busy ? 'disabled' : ''}>
        <textarea class="inp" id="hw-desc" placeholder="Подробное описание..." rows="4" ${busy ? 'disabled' : ''}></textarea>
        <button type="button" class="btn bf btn-w" onclick="window.__ba_submitHw()" ${busy ? 'disabled' : ''}>${busy ? 'Отправка…' : 'Отправить на проверку'}</button>
      </div>
    </div>${renderHomeworkSubmitOverlay()}`
  }

  const renderHwEditModal = () => {
    const m = state.hwEditModal
    if (!m.open) return ''
    const hw = state.selectedHomework
    if (!hw) return ''

    const primaryUrl = hw.has_local_file || hw.has_telegram_file ? getHomeworkFileUrl(hw.id, true) : null
    const atts = Array.isArray(hw.attachments) ? hw.attachments : []

    const existingPhotos = []
    if (primaryUrl && !m.removedPrimary) {
      existingPhotos.push(`<div style="position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1.5px solid var(--border)">
        <img data-auth-src="${esc(primaryUrl)}" src="" alt="" style="width:100%;height:100%;object-fit:cover">
        <button type="button" onclick="window.__ba_hwEditRemovePrimary()" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.8);border:1px solid rgba(201,162,39,.3);color:var(--gold);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">×</button>
      </div>`)
    }
    atts.forEach((a) => {
      if (m.removedAttachmentIds.includes(a.id)) return
      if (!(a.has_local_file || a.has_telegram_file)) return
      const url = getHomeworkAttachmentFileUrl(hw.id, a.id, true)
      existingPhotos.push(`<div style="position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1.5px solid var(--border)">
        <img data-auth-src="${esc(url)}" src="" alt="" style="width:100%;height:100%;object-fit:cover">
        <button type="button" onclick="window.__ba_hwEditRemoveAttachment(${a.id})" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.8);border:1px solid rgba(201,162,39,.3);color:var(--gold);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">×</button>
      </div>`)
    })
    m.newPhotos.forEach((p, i) => {
      existingPhotos.push(`<div style="position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1.5px solid rgba(201,162,39,.4)">
        <img src="${esc(p.url)}" alt="" style="width:100%;height:100%;object-fit:cover">
        <button type="button" onclick="window.__ba_hwEditRemoveNew(${i})" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.8);border:1px solid rgba(201,162,39,.3);color:var(--gold);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">×</button>
      </div>`)
    })

    const totalPhotos = existingPhotos.length
    const canAddMore = totalPhotos < 5

    return `<div style="position:fixed;inset:0;z-index:6000;display:flex;align-items:flex-end;background:rgba(8,8,8,.75);backdrop-filter:blur(8px)" onclick="if(event.target===this)window.__ba_closeHwEdit()">
      <div style="background:var(--card);border-radius:22px 22px 0 0;padding:22px 18px 32px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 -4px 40px rgba(0,0,0,.5)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
          <h3 style="margin:0;font-size:16px;font-weight:700">Редактировать ДЗ</h3>
          <button type="button" onclick="window.__ba_closeHwEdit()" style="background:none;border:none;color:var(--dim);font-size:22px;cursor:pointer;padding:0;line-height:1">×</button>
        </div>
        <input class="inp" id="hwe-haircut" placeholder="Название стрижки" value="${esc(m.savedHaircut ?? hw.haircut_name ?? '')}" style="margin-bottom:8px">
        <textarea class="inp" id="hwe-text" placeholder="Описание работы" rows="3" style="margin-bottom:14px">${esc(m.savedText ?? hw.text_content ?? '')}</textarea>
        ${existingPhotos.length ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">${existingPhotos.join('')}</div>` : ''}
        ${canAddMore ? `<label style="cursor:pointer;display:block;margin-bottom:14px">
          <input id="hwe-file" type="file" accept="image/*" multiple style="display:none" onchange="window.__ba_hwEditAddPhotos(this)">
          <div style="width:100%;height:52px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(201,162,39,.08) 0%,rgba(201,162,39,.02) 100%);border:2px dashed rgba(201,162,39,.25);border-radius:14px;color:var(--gold);gap:6px;font-family:var(--font-body);font-size:11px;font-weight:700">${ICO.camera} Добавить фото (ещё ${5 - totalPhotos})</div>
        </label>` : ''}
        ${m.error ? `<p style="color:var(--danger);font-size:11px;font-family:var(--font-body);margin-bottom:10px">${esc(m.error)}</p>` : ''}
        <button type="button" class="btn bf btn-w" ${m.busy ? 'disabled' : ''} onclick="window.__ba_submitHwEdit()">
          ${m.busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>`
  }

  /** Просмотрщик фотографии поверх экрана: оригинал целиком, листание, свайп, Escape. */
  const renderLightbox = () => {
    const lb = state.lightbox
    if (!lb || !Array.isArray(lb.items) || !lb.items.length) return ''
    const total = lb.items.length
    const i = Math.min(Math.max(0, lb.index), total - 1)
    const item = lb.items[i]
    const arrowStyle =
      'position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;padding:0;border-radius:50%;background:rgba(255,255,255,.12);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:0'
    const arrows =
      total > 1
        ? `<button type="button" aria-label="Предыдущее фото" onclick="event.stopPropagation();window.__ba_lightboxStep(-1)" style="${arrowStyle};left:10px">${ICO.back}</button>
           <button type="button" aria-label="Следующее фото" onclick="event.stopPropagation();window.__ba_lightboxStep(1)" style="${arrowStyle};right:10px">${ICO.forward}</button>`
        : ''
    return `<div id="ba-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр фотографии" onclick="if(event.target===this)window.__ba_closeLightbox()" style="position:fixed;inset:0;z-index:7000;background:rgba(6,6,6,.94);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:14px 16px">
        <span style="color:var(--gold);font-family:var(--font-body);font-size:12px;font-weight:700;letter-spacing:.5px">${total > 1 ? `${i + 1} / ${total}` : 'Фото'}</span>
        <button type="button" aria-label="Закрыть просмотр" onclick="window.__ba_closeLightbox()" style="background:rgba(255,255,255,.12);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer">×</button>
      </div>
      <img data-auth-src="${esc(item.full)}" src="" alt="Фото ${i + 1} из ${total}" style="max-width:92%;max-height:76vh;object-fit:contain;border-radius:10px">
      ${arrows}
      <button type="button" onclick="event.stopPropagation();window.__ba_openFile('${item.full}')" style="position:absolute;bottom:22px;background:none;border:none;color:var(--gold);font-family:var(--font-body);font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline;padding:8px">Открыть оригинал</button>
    </div>`
  }

  const renderHwView = () => {
    const hw = state.selectedHomework
    if (!hw) return ''
    const hdrTitle = `ДЗ #${hw.is_bonus ? 'бонус' : hw.lesson_number ?? '—'}`
    const title = hw.haircut_name || (hw.is_bonus ? 'Бонус' : `Урок #${hw.lesson_number ?? '—'}`)
    const photoItems = homeworkPhotoItems(hw, getHomeworkFileUrl, getHomeworkAttachmentFileUrl)
    state.photoItems = photoItems
    const demoPhotoUrl = demoHomeworkPhotoUrl(hw)
    const carousel =
      photoItems.length > 0
        ? renderHomeworkPhotoStrip(photoItems)
        : demoPhotoUrl
          ? `<img src="${demoPhotoUrl}" alt="Демонстрационная работа: ${esc(title)}" style="width:100%;aspect-ratio:16/9;border-radius:16px;border:1.5px solid var(--border);object-fit:cover;margin-bottom:12px;box-shadow:var(--glow)">`
          : `<div style="width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,rgba(201,162,39,.06) 0%,rgba(201,162,39,.02) 100%);border-radius:16px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--gold);margin-bottom:12px">${ICO.scissors}</div>`

    const extraMedia = renderHomeworkMediaButtons(
      hw,
      (id) => getHomeworkFileUrl(id, false),
      (hid, aid) => getHomeworkAttachmentFileUrl(hid, aid, false),
      { skipPhotos: photoItems.length > 0 },
    )
    const lr = hw.latest_review
    const approvedGrade =
      hw.status === 'approved' && lr && lr.status === 'approved' && lr.rating != null
        ? `<div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:5px"><span style="color:var(--gold)">${ICO.star}</span><span style="font-size:20px;font-weight:700;color:var(--gold)">${esc(lr.rating)}</span><span style="font-size:11px;color:var(--dim);font-family:var(--font-body)">/5</span></div>
        ${lr.comment ? `<div style="margin-top:6px"><div style="font-size:9px;color:var(--dim);font-family:var(--font-body);text-transform:uppercase;margin-bottom:2px">Замечание · ${esc(lr.teacher_name || '')}</div><p style="font-size:12px;font-family:var(--font-body);line-height:1.5">${esc(lr.comment)}</p></div>` : ''}
      </div>`
        : ''
    const lastRejectedReview = (hw.reviews || []).find((r) => r.status === 'rejected')
    const hasRevisionData =
      hw.revision_student_text || hw.revision_has_local_file || hw.revision_has_telegram_file
    const revisionCommentBlock =
      lastRejectedReview &&
      (hw.status === 'revision' || (hw.status === 'pending' && hasRevisionData))
        ? `<div class="card" style="margin-bottom:10px;border-color:rgba(218,170,34,.5);background:linear-gradient(135deg,rgba(218,170,34,.07) 0%,rgba(218,170,34,.01) 100%)">
        <div style="font-size:9px;color:var(--warn);font-family:var(--font-body);text-transform:uppercase;margin-bottom:5px;font-weight:700;letter-spacing:.5px">${hw.status === 'pending' ? 'Предыдущее замечание' : 'Замечание преподавателя'}</div>
        ${lastRejectedReview.comment ? `<p style="font-size:13px;font-family:var(--font-body);line-height:1.6;color:var(--text)">${esc(lastRejectedReview.comment)}</p>` : '<p style="font-size:12px;font-family:var(--font-body);color:var(--dim)">Требуется исправление</p>'}
        <div style="font-size:9px;color:var(--dim);margin-top:6px">${esc(lastRejectedReview.teacher_name || '')}</div>
      </div>`
        : ''

    const stuId = state.session?.student?.id
    const isStudentOwner =
      stuId != null && hw.student_id != null && Number(stuId) === Number(hw.student_id)
    const correctionForm =
      isStudentOwner && hw.status === 'revision'
        ? `<div class="card" style="margin-top:8px;border-color:var(--gold)">
        <h4 style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px;font-family:var(--font-body);text-transform:uppercase;letter-spacing:.5px">Ваше исправление</h4>
        <p style="font-size:11px;color:var(--dim);font-family:var(--font-body);margin-bottom:8px">Внесите правки и отправьте на повторную проверку</p>
        <textarea class="inp" id="hw-correction" placeholder="Исправленное описание..." rows="4">${esc(hw.revision_student_text || hw.text_content || '')}</textarea>
        <label style="cursor:pointer;margin-top:8px;display:block">
          <input id="hw-correction-file" type="file" accept="image/*" style="display:none">
          <div style="width:100%;min-height:80px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(201,162,39,.08) 0%,rgba(201,162,39,.02) 100%);border:2px dashed rgba(201,162,39,.25);border-radius:14px;color:var(--gold);gap:6px;font-family:var(--font-body);font-size:11px;font-weight:700">${ICO.camera} Новое фото (по желанию)</div>
        </label>
        <button type="button" class="btn bf btn-w" style="margin-top:10px" onclick="window.__ba_submitHwRevision(${hw.id})">Отправить на проверку</button>
      </div>`
        : ''

    const correctionDone =
      hw.revision_student_text || hw.revision_has_local_file || hw.revision_has_telegram_file
        ? `<div class="card" style="margin-top:8px;border-color:var(--success)">
        <h4 style="font-size:12px;font-weight:700;color:var(--success);margin-bottom:6px;font-family:var(--font-body);text-transform:uppercase;letter-spacing:.5px">Исправление ученика</h4>
        <p style="font-size:12px;font-family:var(--font-body);line-height:1.5">${esc(hw.revision_student_text || '')}</p>
        ${
          hw.revision_has_local_file || hw.revision_has_telegram_file
            ? `<button type="button" class="btn bs btn-w" style="margin-top:8px" onclick="window.__ba_openFile('${getHomeworkRevisionFileUrl(hw.id)}')">Открыть фото исправления</button>`
            : ''
        }
      </div>`
        : ''

    const homeworkComments = Array.isArray(hw.comments) ? hw.comments : []
    const canComment = isStudentOwner || Boolean(state.session?.isTeacher || state.session?.isAdmin)
    const commentsPanel =
      canComment || homeworkComments.length
        ? `<section class="card" style="margin-top:12px;padding:16px"><h4 style="font-size:14px;font-weight:700;color:var(--gold);margin:0 0 12px">Комментарии к заданию</h4>
          ${homeworkComments.length ? `<div style="display:flex;flex-direction:column;gap:9px;margin-bottom:12px">${homeworkComments.map((comment) => { const teacherComment = comment.author_role === 'teacher' || comment.author_role === 'admin'; return `<div style="padding:10px 11px;border-radius:14px;background:${teacherComment ? 'rgba(201,162,39,.09)' : 'rgba(0,0,0,.035)'};border:1px solid ${teacherComment ? 'rgba(201,162,39,.2)' : 'var(--border)'}"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:5px"><span style="font-family:var(--font-body);font-size:10px;font-weight:800;color:${teacherComment ? 'var(--gold)' : 'var(--text)'}">${esc(comment.author_name)} · ${teacherComment ? 'Преподаватель' : 'Ученик'}</span></div><p style="margin:0;font-family:var(--font-body);font-size:12px;line-height:1.5">${esc(comment.text_content)}</p></div>` }).join('')}</div>` : '<p style="margin:0 0 12px;color:var(--dim);font-family:var(--font-body);font-size:11px">Комментариев пока нет.</p>'}
          ${canComment ? `<textarea class="inp" id="hw-thread-comment" rows="3" placeholder="${isStudentOwner ? 'Ответить на комментарий или описать исправление…' : 'Написать дополнительный комментарий…'}"></textarea><button type="button" class="btn bf btn-w" style="margin-top:9px" onclick="window.__ba_addHomeworkComment(${hw.id})">${isStudentOwner ? 'Ответить' : 'Отправить комментарий'}</button>` : ''}
        </section>`
        : ''

    const canGrade = Boolean(state.session?.isTeacher || state.session?.isAdmin)
    const teacherPanel =
      canGrade && hw.status === 'pending'
        ? `<div class="card" style="margin-top:8px">
        <h4 style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:10px;font-family:var(--font-body);text-transform:uppercase;letter-spacing:.5px">Проверка</h4>
        <div style="margin-bottom:10px">
          <div style="font-size:9px;color:var(--dim);font-family:var(--font-body);text-transform:uppercase;margin-bottom:7px;letter-spacing:.5px">Оценка</div>
          <div id="hw-stars" data-rating="0" style="display:flex;gap:2px">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" onclick="window.__ba_setHwStar(${hw.id},${n})" id="hw-star-${n}" style="background:none;border:none;cursor:pointer;font-size:30px;line-height:1;color:rgba(201,162,39,.2);padding:2px 4px;transition:color .12s">★</button>`).join('')}
          </div>
        </div>
        <textarea class="inp" id="hw-comment" placeholder="Комментарий (обязателен, если не ставите оценку)…" rows="3" oninput="window.__ba_onHwCommentChange()">${lr?.comment && lr.status !== 'approved' ? esc(lr.comment) : ''}</textarea>
        <button type="button" class="btn bf btn-w" id="hw-submit-btn" style="margin-top:10px;opacity:.4;cursor:not-allowed" onclick="window.__ba_saveHwGradeInline(${hw.id})" disabled>Принять</button>
      </div>`
        : ''

    const canEdit = isStudentOwner && hw.status === 'pending'

    return `${hdr(hdrTitle, true, 'window.__ba_back()', '')}
      <div class="scr fi" style="padding:14px">
        ${carousel}
        <h3 style="font-size:17px;font-weight:600;margin-bottom:4px">${esc(title)}</h3>
        <p style="color:var(--dim);font-family:var(--font-body);font-size:12px;line-height:1.6;margin-bottom:10px">${esc(hw.text_content || '')}</p>
        <div style="font-family:var(--font-body);font-size:11px;color:var(--dim);margin-bottom:10px">Статус: ${esc(homeworkStatusRu(hw.status))}</div>
        ${canEdit ? `<button type="button" class="btn bs btn-w" style="margin-bottom:12px" onclick="window.__ba_openHwEdit(${hw.id})">Редактировать</button>` : ''}
        ${extraMedia ? `<div style="margin-bottom:12px">${extraMedia}</div>` : ''}
        ${approvedGrade}
        ${revisionCommentBlock}
        ${correctionForm}
        ${correctionDone}
        ${commentsPanel}
        ${teacherPanel}
      </div>
      ${renderHwEditModal()}
      ${renderLightbox()}`
  }

  const renderChatScreen = () => {
    const isTeacherOrAdmin = Boolean(state.session?.isTeacher || state.session?.isAdmin)
    const threadId = isTeacherOrAdmin
      ? state.selectedStudent?.id != null
        ? String(state.selectedStudent.id)
        : null
      : state.session?.student?.id != null
        ? String(state.session.student.id)
        : null
    const msgs = threadId ? state.chats.messagesByStudentId.get(threadId) || [] : []

    const msgsHtml =
      !threadId && isTeacherOrAdmin
        ? `<p class="empty">Откройте чат из профиля ученика — кнопка «Чат с учеником».</p>`
        : !threadId
          ? `<p class="empty">Не удалось определить чат.</p>`
          : msgs.length
            ? msgs
                .map((m) => {
                  const mine = Number(m.sender_user_id) === Number(state.session?.user_id || 0)
                  const bubbleCls = mine ? 'msg-bubble msg-mine' : 'msg-bubble msg-other'
                  const roleLabel = m.sender_role ? String(m.sender_role) : ''
                  const roleColor = m.sender_role_color || 'var(--dim)'
                  const fileLink = m.has_file
                    ? `<div style="margin-top:6px"><button type="button" onclick="window.__ba_openFile('${getChatFileUrl(m.id)}')" style="color:var(--gold);font-family:var(--font-body);font-size:11px;background:none;border:none;padding:0;cursor:pointer">Файл</button></div>`
                    : ''
                  return `<div style="margin-bottom:8px;text-align:${mine ? 'right' : 'left'}">
                  <div class="${bubbleCls}">
                    <div style="font-size:9px;font-weight:700;color:${esc(roleColor)};font-family:var(--font-body);margin-bottom:1px">${esc(m.sender_name || '')}${roleLabel ? ` <span style="font-weight:400;color:var(--dim)">(${esc(roleLabel)})</span>` : ''}</div>
                    ${m.text_content ? `<div>${esc(m.text_content)}</div>` : ''}
                    ${fileLink}
                    <div style="font-size:8px;color:var(--dim);font-family:var(--font-body);margin-top:4px">${esc(m.created_at)}</div>
                  </div>
                </div>`
                })
                .join('')
            : `<p class="empty">Сообщений нет</p>`

    const studentIdToSend = threadId
    return `<div style="display:flex;flex-direction:column;height:100%">
      <div class="scr" style="padding:0">
        <div id="chat-scroll" style="padding:12px">${msgsHtml}</div>
      </div>
      ${studentIdToSend ? `<div class="chat-input-row">
        <input class="inp" id="chat-input" placeholder="Сообщение..." style="flex:1" onkeydown="if(event.key==='Enter')window.__ba_sendChat('${studentIdToSend}')">
        <button class="btn bf bs" onclick="window.__ba_sendChat('${studentIdToSend}')" style="padding:8px 10px">${ICO.send}</button>
      </div>` : ''}
    </div>`
  }

  const renderTeacher = () => {
    const t = state.tab || 'profile'
    const unread = Number(state.session?.unread_notifications_count || 0)
    let content = ''
    if (t === 'profile') {
      const teacher = state.session?.teacher || {}
      const items = state.teacherStudents.items || []
      const dashboard = state.teacherDashboard.data || {}
      const pending = Number(dashboard.pendingCount || 0)
      const isLocalDemoTeacher = import.meta.env.DEV && Number(state.appUserId) === LOCAL_PREVIEW_TEACHER_ID
      const teacherAbout =
        teacher.about_me ||
        (isLocalDemoTeacher
          ? 'Я барбер и преподаватель MADCAP Academy. Помогаю ученикам уверенно осваивать базу, видеть сильные стороны своей работы и развивать собственный стиль.'
          : '')
      content =
        hdr('Профиль преподавателя', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr fi" style="padding:14px">
          <section class="card" style="padding:22px;text-align:center;margin-bottom:14px">
            <div style="position:relative;width:76px;height:76px;border-radius:50%;overflow:hidden;background:var(--gold-dim);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;color:var(--gold);font-weight:800;font-size:21px">${isLocalDemoTeacher ? '<img src="/demo-teacher-barber.png" alt="Демонстрационный преподаватель" style="position:absolute;inset:0;width:76px;height:76px;object-fit:cover">' : `<img src="/academy-role-logo.jpg" alt="" style="position:absolute;inset:0;width:76px;height:76px;object-fit:cover;opacity:.25"><span style="position:relative">${esc(initialsFromName(teacher.full_name || 'П'))}</span>`}</div>
            <h2 style="margin:0;font-size:22px">${esc(teacher.full_name || 'Преподаватель')}</h2>
            <p style="margin:6px 0 0;color:var(--gold);font-family:var(--font-body);font-size:10px;text-transform:uppercase;letter-spacing:1.1px">MADCAP ACADEMY · ПРЕПОДАВАТЕЛЬ</p>
          </section>
          <section class="card" style="padding:18px;margin-bottom:14px"><h3 style="margin:0 0 8px;font-size:18px">Обо мне</h3><textarea class="inp" id="teacher-about" rows="4" maxlength="1000" placeholder="Расскажите ученикам о себе…">${esc(teacherAbout)}</textarea><button type="button" class="btn bs btn-w" style="margin-top:10px" onclick="window.__ba_saveTeacherAbout()">Сохранить</button></section>
          <button type="button" class="card" style="display:block;width:100%;text-align:left;padding:18px;margin-bottom:14px;cursor:pointer;border-color:${pending ? 'rgba(201,162,39,.55)' : 'var(--border)'}" onclick="window.__ba_setTab('review')">
            <div style="display:flex;align-items:center;gap:14px"><div style="width:48px;height:48px;border-radius:16px;background:var(--gold);color:#16120a;display:flex;align-items:center;justify-content:center">${ICO.check}</div><div style="flex:1"><div style="font-size:17px;font-weight:700;color:var(--gold)">Проверить</div><div style="margin-top:4px;color:var(--dim);font-family:var(--font-body);font-size:11px">${pending ? `Новых работ на проверку: ${pending}` : 'Новых работ на проверку нет'}</div></div><div style="font-size:26px;color:var(--gold)">›</div></div>
          </button>
          <section class="card" style="padding:18px"><div class="grid2"><div><div class="stat-label">Мои ученики</div><div class="stat-val">${esc(items.length)}</div></div><div><div class="stat-label">На проверке</div><div class="stat-val" style="color:var(--gold)">${esc(pending)}</div></div></div></section>
        </div>`
    } else if (t === 'review') {
      const dashboard = state.teacherDashboard
      const pendingStudents = dashboard.data?.students || []
      content =
        hdr('Проверить', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr fi" style="padding:14px"><p style="margin:0 0 14px;color:var(--dim);font-family:var(--font-body);font-size:11px;line-height:1.5">Здесь появляются только ученики, которые отправили домашнее задание и ждут вашей проверки.</p>
          ${dashboard.status === 'loading' || dashboard.status === 'idle' ? '<p class="empty">Загрузка…</p>' : ''}
          ${dashboard.status === 'error' ? `<p class="empty">${esc(dashboard.error)}</p>` : ''}
          ${dashboard.status === 'loaded' && !pendingStudents.length ? '<p class="empty">Новых работ на проверку нет</p>' : ''}
          ${pendingStudents.map((s) => `<button type="button" class="card" style="display:flex;width:100%;text-align:left;align-items:center;gap:12px;padding:14px;margin-bottom:10px;cursor:pointer" onclick="window.__ba_openTeacherStudent(${s.id},'${esc(s.full_name)}')"><div style="position:relative;overflow:hidden;width:45px;height:45px;border-radius:50%;background:var(--gold-dim);color:var(--gold);display:flex;align-items:center;justify-content:center;font-weight:800">${esc(initialsFromName(s.full_name))}${studentAvatarImg(s, getStudentAvatarUrl)}</div><div style="flex:1"><div style="font-weight:700;font-family:var(--font-body);font-size:13px">${esc(s.full_name)}</div><div style="font-family:var(--font-body);font-size:10px;color:var(--warn);margin-top:4px">На проверке: ${esc(s.pending_count)} ДЗ</div></div><span class="badge" style="background:var(--gold-dim);color:var(--gold)">Проверить</span></button>`).join('')}
        </div>`
    } else if (t === 'students') {
      const items = state.teacherStudents.items || []
      const stu = state.teacherStudents.status
      const showLoading = stu === 'loading' || stu === 'idle'
      content =
        hdr('Мои ученики', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr" style="padding:12px">
          ${renderVkLinkTelegramCard()}
          ${showLoading ? '<p class="empty">Загрузка…</p>' : ''}
          ${stu === 'error' ? `<p class="empty">${esc(state.teacherStudents.error)}</p>` : ''}
          ${items.length
            ? items
                .map((s) => {
                  const pending = Number(s.pending_homeworks_count || 0)
                  const avg = s.average_rating != null ? Number(s.average_rating).toFixed(2) : '—'
                  const tchs = (s.teachers || []).map((t) => t.full_name).filter(Boolean)
                  const tline = tchs.length ? tchs.join(', ') : 'не назначен'
                  return `<div class="card" data-student-name="${esc(s.full_name)}" data-student-track="${esc(s.student_track || 'student')}" style="margin-bottom:10px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="window.__ba_openTeacherStudent(${s.id},'${esc(s.full_name)}')">
              <div style="position:relative;overflow:hidden;width:44px;height:44px;border-radius:50%;background:rgba(201,162,39,.12);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--gold);flex-shrink:0">${esc(initialsFromName(s.full_name))}${studentAvatarImg(s, getStudentAvatarUrl)}</div>
              <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px;font-family:var(--font-body)">${esc(s.full_name)}</div>
              <div style="font-size:10px;color:var(--dim);font-family:var(--font-body);line-height:1.5;margin-top:4px">
                <span style="color:var(--text)">${esc(studentStatusRu(s.status))}</span> · ${esc(s.lessons_count ?? '—')} зан.${pending ? ` · <span style="color:var(--warn)">ДЗ на проверке: ${pending}</span>` : ''}
              </div>
              <div style="font-size:10px;color:var(--dim);font-family:var(--font-body);margin-top:4px">Ср. балл: <span style="color:var(--gold)">${esc(avg)}</span> · Преп.: ${esc(tline)}</div>
              </div>
            </div>`
                })
                .join('')
            : stu === 'loaded'
              ? '<p class="empty">Нет учеников</p>'
              : ''}
        </div>`
    } else if (t === 'notifs') {
      content =
        hdr('Уведомления', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr" style="padding:12px">${renderVkLinkTelegramCard()}${renderNotifs()}</div>`
    }
    return (
      content +
      tabBar(
        [
          { k: 'profile', i: ICO.user, l: 'Профиль' },
          { k: 'review', i: ICO.check, l: 'Проверить', c: Number(state.teacherDashboard.data?.pendingCount || 0) },
          { k: 'students', i: ICO.users, l: 'Ученики' },
          { k: 'notifs', i: ICO.bell, l: 'Увед.', c: unread },
        ],
        t,
      )
    )
  }

  const renderTeacherStudent = () => {
    const items = state.teacherStudentHomeworks.items || []
    const st = state.teacherStudentHomeworks.student
    const title = st?.full_name || state.selectedStudent?.full_name || 'Ученик'
    const avg = st?.average_rating != null ? Number(st.average_rating).toFixed(2) : '—'
    const tchs = (st?.teachers || []).map((t) => t.full_name).filter(Boolean).join(', ') || '—'
    const track = st?.student_track || 'student'
    const profile =
      st &&
      `<div class="card" style="margin-bottom:12px">
        <div style="text-align:center;margin-bottom:10px">
          <h3 style="font-size:17px;font-weight:600;margin:0">${esc(st.full_name)}</h3>
          <div style="margin-top:8px">${badge(studentStatusRu(st.status))}</div>
        </div>
        <div class="grid2" style="gap:10px">
          <div><div class="stat-label">Занятий</div><div class="stat-val">${esc(st.lessons_count ?? '—')}</div></div>
          <div><div class="stat-label">Ср. балл</div><div class="stat-val">${esc(avg)}</div></div>
          <div style="grid-column:span 2"><div class="stat-label">Метро</div><div style="font-size:13px;font-family:var(--font-body)">${esc(st.metro || 'Не указано')}</div></div>
          <div style="grid-column:span 2"><div class="stat-label">Преподаватели</div><div style="font-size:13px;font-family:var(--font-body)">${esc(tchs)}</div></div>
        </div>
        ${st.about_me ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)"><div class="stat-label">Обо мне</div><p style="margin:6px 0 0;font-size:12px;font-family:var(--font-body);color:var(--dim);line-height:1.55">${esc(st.about_me)}</p></div>` : ''}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button class="btn btn-w" style="flex:1" onclick="window.__ba_teacherOpenChat(${st.id})">${ICO.chat} Чат с учеником</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h4 style="font-size:14px;font-weight:600;color:var(--gold);margin:0">Портфолио</h4>
      </div>`

    const modernProfile = st
      ? `<section style="position:relative;min-height:320px;overflow:hidden;background:linear-gradient(145deg,#211d15 0%,#080808 72%);border-radius:0 0 28px 28px">
          ${studentAvatarImg(st, getStudentAvatarUrl, { rounded: false }) || `<img src="/demo-student-barber.png" alt="Демонстрационный профиль ${esc(st.full_name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`}
          <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 24%,rgba(0,0,0,.86) 100%)"></div>
          <img src="/academy-role-logo.jpg" alt="MADCAP Academy" style="position:absolute;top:16px;left:16px;width:44px;height:44px;object-fit:cover;border-radius:50%;border:1px solid rgba(255,255,255,.65);box-shadow:0 4px 15px rgba(0,0,0,.28)">
          <div style="position:absolute;left:20px;right:20px;bottom:48px;color:#fff">
            <div style="font-size:10px;font-family:var(--font-body);letter-spacing:1.4px;text-transform:uppercase;opacity:.8;margin-bottom:7px">MADCAP ACADEMY · ПРОФИЛЬ УЧЕНИКА</div>
            <h1 style="margin:0;font-size:29px;line-height:1.05;font-weight:650;letter-spacing:-.6px">${esc(st.full_name)}</h1>
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${badge(studentStatusRu(st.status))}${badge(studentTrackRu(track))}</div>
          </div>
        </section>
        <div class="card" style="position:relative;margin:-32px 14px 14px;border-radius:22px;box-shadow:0 12px 28px rgba(0,0,0,.18)">
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
            <div><div class="stat-label">Занятий</div><div class="stat-val">${esc(st.lessons_count ?? '—')}</div></div>
            <div><div class="stat-label">Ср. балл</div><div class="stat-val">${esc(avg)}</div></div>
            <div><div class="stat-label">Метро</div><div class="stat-val" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(st.metro || 'Не указано')}">${esc(st.metro || '—')}</div></div>
            <div style="grid-column:span 3"><div class="stat-label">Преподаватели</div><div style="font-size:13px;font-family:var(--font-body)">${esc(tchs)}</div></div>
          </div>
        </div>
        <div style="padding:0 14px">
          <section class="card" style="margin-bottom:14px;padding:18px">
            <h4 style="font-size:19px;font-weight:650;margin:0 0 8px">Обо мне</h4>
            <p style="margin:0;color:var(--dim);font-family:var(--font-body);font-size:12px;line-height:1.65">${esc(st.about_me || 'Ученик пока не заполнил информацию о себе.')}</p>
          </section>
          <button class="btn bs btn-w" style="margin-bottom:16px" onclick="window.__ba_teacherOpenChat(${st.id})">${ICO.chat} Чат с учеником</button>
          <section class="card" style="padding:18px">
            <div style="margin-bottom:12px"><h4 style="font-size:17px;font-weight:650;color:var(--gold);margin:0">Мои работы</h4><p style="margin:3px 0 0;color:var(--dim);font-family:var(--font-body);font-size:10px">Домашние задания и результаты обучения</p></div>
          </section>
        </div>`
      : profile

    return `${hdr(title, true, 'window.__ba_back()', '')}
      <div class="scr fi" style="padding:14px;padding-top:12px">
        ${state.teacherStudentHomeworks.status === 'loading' ? '<p class="empty">Загрузка…</p>' : ''}
        ${state.teacherStudentHomeworks.status === 'error' ? `<p class="empty">${esc(state.teacherStudentHomeworks.error)}</p>` : ''}
        ${state.teacherStudentHomeworks.status === 'loaded' ? modernProfile || '' : ''}
        ${items.length
          ? items
              .map(
                (hw) => `<div class="card" style="margin-bottom:8px;cursor:pointer" onclick="window.__ba_openTeacherHw(${hw.id})">
          <div style="font-family:var(--font-body);font-weight:800;font-size:11px">${esc(hw.haircut_name || (hw.is_bonus ? 'Бонус' : `Урок #${hw.lesson_number ?? '—'}`))}</div>
          <div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-top:4px">${esc(homeworkStatusRu(hw.status))}</div>
        </div>`,
              )
              .join('')
          : state.teacherStudentHomeworks.status === 'loaded'
            ? '<p class="empty">Нет работ</p>'
            : ''}
      </div>`
  }

  const renderAdminStudentProfile = () => {
    const st = state.adminStudentProfile.student
    const items = state.adminStudentProfile.homeworks || []
    const title = st?.full_name || 'Ученик'
    const avg = st?.average_rating != null ? Number(st.average_rating).toFixed(2) : '—'
    const tchs = (st?.teachers || [])
      .map((x) => x.full_name)
      .filter(Boolean)
      .join(', ') || '—'
    const track = st?.student_track || 'student'
    const modernProfile =
      st &&
      `<section style="position:relative;min-height:320px;overflow:hidden;background:#111;border-radius:0 0 28px 28px">
        ${studentAvatarImg(st, getStudentAvatarUrl, { rounded: false }) || `<img src="/demo-student-barber.png" alt="Демонстрационный профиль ${esc(st.full_name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`}
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04) 25%,rgba(0,0,0,.86) 100%)"></div>
        <img src="/academy-role-logo.jpg" alt="MADCAP Academy" style="position:absolute;top:16px;left:16px;width:44px;height:44px;object-fit:cover;border-radius:50%;border:1px solid rgba(255,255,255,.7)">
        <div style="position:absolute;left:20px;right:20px;bottom:42px;color:#fff">
          <div style="font-size:10px;font-family:var(--font-body);letter-spacing:1.4px;text-transform:uppercase;opacity:.82;margin-bottom:7px">MADCAP ACADEMY · ПРОФИЛЬ УЧЕНИКА</div>
          <h1 style="margin:0;font-size:29px;line-height:1.05;font-weight:650">${esc(st.full_name)}</h1>
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${badge(studentStatusRu(st.status))}${badge(studentTrackRu(track))}</div>
        </div>
      </section>
      <div class="card" style="position:relative;margin:-30px 14px 14px;border-radius:22px;box-shadow:0 12px 28px rgba(0,0,0,.18)">
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
          <div><div class="stat-label">Занятий</div><div class="stat-val">${esc(st.lessons_count ?? '—')}</div></div>
          <div><div class="stat-label">Ср. балл</div><div class="stat-val">${esc(avg)}</div></div>
          <div><div class="stat-label">Метро</div><div class="stat-val" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(st.metro || '—')}</div></div>
          <div style="grid-column:span 3"><div class="stat-label">Преподаватели</div><div style="font-size:13px;font-family:var(--font-body)">${esc(tchs)}</div></div>
        </div>
      </div>
      <div style="padding:0 14px">
        <section class="card" style="margin-bottom:14px;padding:18px"><h4 style="font-size:19px;font-weight:650;margin:0 0 8px">Обо мне</h4><p style="margin:0;color:var(--dim);font-family:var(--font-body);font-size:12px;line-height:1.65">${esc(st.about_me || 'Ученик пока не заполнил информацию о себе.')}</p></section>
        <section class="card" style="margin-bottom:14px;padding:18px"><div class="stat-label">Телефон · виден администратору</div><div style="font-size:14px;font-family:var(--font-body);margin-top:5px">${esc(st.phone || '—')}</div></section>
        <button class="btn bs btn-w" style="margin-bottom:16px" onclick="window.__ba_adminChatFromProfile(${st.id})">${ICO.chat} Чат с учеником</button>
        <div style="margin-bottom:10px"><h4 style="font-size:17px;font-weight:650;color:var(--gold);margin:0">Мои работы</h4><p style="margin:3px 0 0;color:var(--dim);font-family:var(--font-body);font-size:10px">Домашние задания и результаты обучения</p></div>
      </div>`
    const profile =
      st &&
      `<div class="card" style="margin-bottom:12px">
        <div style="text-align:center;margin-bottom:10px">
          <div style="position:relative;overflow:hidden;width:52px;height:52px;border-radius:50%;background:rgba(201,162,39,.12);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-weight:800;font-size:15px;color:var(--gold)">${esc(initialsFromName(st.full_name))}${studentAvatarImg(st, getStudentAvatarUrl)}</div>
          <h3 style="margin:0;font-size:17px;font-weight:600">${esc(st.full_name)}</h3>
          <div style="margin-top:8px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
            ${badge(studentStatusRu(st.status))}
            ${badge(studentTrackRu(track))}
          </div>
        </div>
        <div class="grid2" style="gap:10px">
          <div><div class="stat-label">Занятий</div><div class="stat-val">${esc(st.lessons_count ?? '—')}</div></div>
          <div><div class="stat-label">Ср. балл</div><div class="stat-val">${esc(avg)}</div></div>
          <div style="grid-column:span 2"><div class="stat-label">Телефон</div><div style="font-size:13px;font-family:var(--font-body)">${esc(st.phone || '—')}</div></div>
          <div style="grid-column:span 2"><div class="stat-label">Преподаватели</div><div style="font-size:13px;font-family:var(--font-body)">${esc(tchs)}</div></div>
        </div>
      </div>
      <div style="padding:0 0 14px"><button class="btn btn-w" style="width:100%" onclick="window.__ba_adminChatFromProfile(${st.id})">${ICO.chat} Чат с учеником</button></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h4 style="font-size:14px;font-weight:600;color:var(--gold);margin:0">Портфолио</h4>
      </div>`

    return `${hdr(title, true, 'window.__ba_back()', '')}
      <div class="scr fi" style="padding:14px;padding-top:12px">
        ${state.adminStudentProfile.status === 'loading' ? '<p class="empty">Загрузка…</p>' : ''}
        ${state.adminStudentProfile.status === 'error' ? `<p class="empty">${esc(state.adminStudentProfile.error)}</p>` : ''}
        ${state.adminStudentProfile.status === 'loaded' ? modernProfile || '' : ''}
        ${items.length
          ? items
              .map(
                (hw) => `<div class="card" style="margin-bottom:8px;cursor:pointer" onclick="window.__ba_adminProfileOpenHw(${hw.id})">
          <div style="font-family:var(--font-body);font-weight:800;font-size:11px">${esc(hw.haircut_name || (hw.is_bonus ? 'Бонус' : `Урок #${hw.lesson_number ?? '—'}`))}</div>
          <div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-top:4px">${esc(homeworkStatusRu(hw.status))}</div>
        </div>`,
              )
              .join('')
          : state.adminStudentProfile.status === 'loaded'
            ? '<p class="empty">Нет работ</p>'
            : ''}
      </div>`
  }

  const renderAdminTeacherDetail = () => {
    const t = state.selectedAdminTeacher
    if (!t) {
      return `${hdr('Преподаватель', true, 'window.__ba_back()', '')}<div class="scr fi" style="padding:14px"><p class="empty">Не выбран</p></div>`
    }
    const students = (state.adminStudents.items || []).filter((s) => (s.teacher_ids || []).includes(t.id))
    const myStudents = students
    const cnt = myStudents.length
    const phone = t.phone || '—'
    return `${hdr(esc(t.full_name), true, 'window.__ba_back()', '')}
      <div class="scr fi" style="padding:14px">
        <div style="text-align:center;margin-bottom:16px">
          <div style="width:72px;height:72px;border-radius:50%;background:rgba(201,162,39,.12);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-weight:800;font-size:18px;color:var(--gold)">${esc(initialsFromName(t.full_name))}</div>
          <h3 style="margin-top:8px;font-size:19px;font-weight:600">${esc(t.full_name)}</h3>
          <div style="margin-top:5px"><span class="badge" style="background:rgba(51,170,51,.12);color:var(--success);border:1px solid rgba(51,170,51,.25)">Преподаватель</span></div>
        </div>
        <div class="card" style="margin-bottom:12px">
          <div class="grid2" style="gap:10px">
            <div><div class="stat-label">Телефон</div><div style="font-size:13px;font-family:var(--font-body)">${esc(phone)}</div></div>
            <div><div class="stat-label">Учеников</div><div class="stat-val">${esc(cnt)}</div></div>
          </div>
        </div>
        ${
          myStudents.length
            ? `<div style="margin-bottom:10px"><h4 style="font-size:14px;font-weight:600;color:var(--gold);margin:0">Ученики преподавателя</h4></div>
        ${myStudents
          .map(
            (s) =>
              `<div class="card" style="margin-bottom:8px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="window.__ba_adminOpenStudent(${s.id})">
          <div style="position:relative;overflow:hidden;width:44px;height:44px;border-radius:50%;background:rgba(201,162,39,.12);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--gold);flex-shrink:0">${esc(initialsFromName(s.full_name))}${studentAvatarImg(s, getStudentAvatarUrl)}</div>
          <div style="flex:1"><div style="font-weight:600;font-size:13px">${esc(s.full_name)}</div><div style="margin-top:4px">${badge(studentStatusRu(s.status))}</div></div>
        </div>`,
          )
          .join('')}`
            : '<p class="empty">Нет прикреплённых учеников</p>'
        }
      </div>`
  }

  const renderAdmin = () => {
    const t = state.tab || 'pending'
    const unread = Number(state.session?.unread_notifications_count || 0)
    const pendingCount =
      (state.adminModeration.items || []).length + (state.adminTeacherApplications.items || []).length + (state.adminProfileEdits.items || []).length
    let content = ''
    if (t === 'feedback') {
      const f = state.adminFeedback
      content = hdr('Обратная связь', false, '') + `<div class="scr" style="padding:14px"><p style="font-size:12px;color:var(--dim);line-height:1.5;margin-bottom:14px">Конфиденциальные отзывы. Доступны только администраторам академии.</p>
        ${f.items.map((item) => `<article class="card" style="margin-bottom:12px"><h3 style="font-size:17px;margin-bottom:8px">${esc(item.full_name)}</h3><div style="font-size:12px;color:var(--gold)">${esc(feedbackSubject(item.subject))} · ${esc(item.created_at)}</div><p style="white-space:pre-wrap;font-size:14px;line-height:1.6;margin-top:10px">${esc(item.message)}</p></article>`).join('')}
        ${f.busy ? '<p class="empty">Загрузка…</p>' : ''}${f.error ? `<p role="alert">${esc(f.error)}</p><button class="btn bs" onclick="window.__ba_loadFeedback(false)">Повторить</button>` : ''}
        ${!f.busy && !f.error && !f.items.length ? '<p class="empty">Пока нет отзывов. Здесь появятся сообщения учеников.</p>' : ''}
        ${f.next ? '<button class="btn bs btn-w" onclick="window.__ba_loadFeedback(true)">Показать ещё</button>' : ''}</div>`
    } else if (t === 'pending') {
      const items = state.adminModeration.items || []
      const taItems = state.adminTeacherApplications.items || []
      const loadingTA = state.adminTeacherApplications.status === 'loading'
      const loadedTA = state.adminTeacherApplications.status === 'loaded'
      const teachersAll = state.adminTeachers.items || []
      const modLoaded = state.adminModeration.status === 'loaded'
      const peItems = state.adminProfileEdits.items || []
      const allPendingEmpty = modLoaded && loadedTA && !loadingTA && !items.length && !taItems.length && !peItems.length
      const pendingBlock =
        state.adminModeration.status === 'loading'
          ? '<p class="empty">Загрузка…</p>'
          : state.adminModeration.status === 'error'
            ? `<p class="empty">${esc(state.adminModeration.error)}</p>`
            : allPendingEmpty
              ? `<div class="empty"><div style="margin-bottom:8px">${ICO.check}</div>Все заявки обработаны</div>`
              : `<p style="color:var(--dim);font-family:var(--font-body);font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Ожидают · ${pendingCount}</p>`
      const studentCards = items.length
        ? items
            .map((s) => {
              const teachersHtml = teachersAll.length
                ? teachersAll
                    .map((tt) => {
                      const cnt = Number(tt.students_count ?? 0)
                      return `<label class="tcb"><input type="checkbox" class="pa-cb-${s.id}" value="${tt.id}"><span class="tcb-box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#080808" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div class="tcb-info"><div class="tcb-name">${esc(tt.full_name)}</div><div class="tcb-sub">Учеников: ${cnt}</div></div></label>`
                    })
                    .join('')
                : ''
              const assignBlock = teachersHtml
                ? `<div style="margin-bottom:8px"><div style="font-size:10px;color:var(--dim);font-family:var(--font-body);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Назначить преподавателей</div><div class="tcb-wrap">${teachersHtml}</div></div>`
                : '<p class="empty" style="padding:4px 0;font-size:11px">Нет одобренных преподавателей — назначьте позже в списке учеников.</p>'
              return `<div class="card pending-card" style="margin-bottom:10px">
            <div style="font-family:var(--font-body);font-weight:800;font-size:12px;margin-bottom:6px">${esc(s.full_name)}</div>
            <div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-bottom:4px">Тел.: ${esc(s.phone || '—')}</div>
            <div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-bottom:10px">Telegram ID ${esc(s.telegram_id)}</div>
            ${assignBlock}
            <div style="display:flex;gap:6px">
              <button class="btn bg-btn bs" style="flex:1" onclick="window.__ba_adminApprove(${s.id})">Одобрить</button>
              <button class="btn bd bs" style="flex:1" onclick="window.__ba_adminReject(${s.id})">Отклонить</button>
            </div>
          </div>`
            })
            .join('')
        : modLoaded
          ? ''
          : ''
      content =
        hdr('Заявки', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr" style="padding:12px">
          ${renderVkLinkTelegramCard()}
          ${pendingBlock}
          ${
            state.adminModeration.status === 'loaded' && !allPendingEmpty
              ? `<div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:8px;font-family:var(--font-body);text-transform:uppercase;letter-spacing:.5px">Ученики</div>
          ${studentCards || '<p class="empty" style="margin-bottom:14px">Нет заявок учеников</p>'}
          <div style="height:8px"></div>
          <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:8px;font-family:var(--font-body);text-transform:uppercase;letter-spacing:.5px">Преподаватели</div>
          ${loadingTA ? '<p class="empty">Загрузка заявок…</p>' : ''}
          ${state.adminTeacherApplications.status === 'error' ? `<p class="empty">${esc(state.adminTeacherApplications.error)}</p>` : ''}
          ${taItems.length ? taItems.map((a) => `<div class="card pending-card" style="margin-bottom:10px;border-color:rgba(100,149,237,.35)">
            <div style="font-family:var(--font-body);font-weight:800;font-size:12px;margin-bottom:6px">${esc(a.full_name)}</div>
            <div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-bottom:4px">Тел.: ${esc(a.phone || '—')}</div>
            <div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-bottom:10px">ID ${esc(a.telegram_id)}</div>
            <div style="display:flex;gap:6px">
              <button class="btn bg-btn bs" style="flex:1" onclick="window.__ba_adminTeacherApp(${a.id},'approve')">Одобрить</button>
              <button class="btn bd bs" style="flex:1" onclick="window.__ba_adminTeacherApp(${a.id},'reject')">Отклонить</button>
            </div>
          </div>`).join('') : loadedTA && !loadingTA ? '<p class="empty">Нет заявок преподавателей</p>' : ''}
          <div style="height:8px"></div>
          <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:8px;font-family:var(--font-body);text-transform:uppercase;letter-spacing:.5px">Изменения профиля</div>
          ${state.adminProfileEdits.status === 'loading' ? '<p class="empty">Загрузка…</p>' : ''}
          ${state.adminProfileEdits.status === 'error' ? `<p class="empty">${esc(state.adminProfileEdits.error)}</p>` : ''}
          ${peItems.length ? peItems.map((e) => {
            const changes = []
            if (e.new_full_name !== e.current_full_name) changes.push(`Имя: <b>${esc(e.current_full_name)}</b> → <b>${esc(e.new_full_name)}</b>`)
            if (e.new_phone !== e.current_phone) changes.push(`Тел.: <b>${esc(e.current_phone)}</b> → <b>${esc(e.new_phone)}</b>`)
            const oldMetro = e.current_metro || '—'
            const newMetro = e.new_metro || '—'
            if (newMetro !== oldMetro) changes.push(`Метро: <b>${esc(oldMetro)}</b> → <b>${esc(newMetro)}</b>`)
            return `<div class="card pending-card" style="margin-bottom:10px;border-color:rgba(100,149,237,.35)">
              <div style="font-family:var(--font-body);font-weight:800;font-size:12px;margin-bottom:6px">${esc(e.current_full_name)}</div>
              <div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-bottom:8px">Telegram ID ${esc(String(e.telegram_id))}</div>
              ${changes.length ? `<div style="font-size:11px;font-family:var(--font-body);line-height:1.8;margin-bottom:10px">${changes.join('<br>')}</div>` : '<div style="font-size:11px;color:var(--dim);font-family:var(--font-body);margin-bottom:10px">Нет изменений</div>'}
              <div style="display:flex;gap:6px">
                <button class="btn bg-btn bs" style="flex:1" onclick="window.__ba_adminProfileEdit(${e.id},'approve')">Одобрить</button>
                <button class="btn bd bs" style="flex:1" onclick="window.__ba_adminProfileEdit(${e.id},'reject')">Отклонить</button>
              </div>
            </div>`
          }).join('') : state.adminProfileEdits.status === 'loaded' ? '<p class="empty">Нет заявок на изменение профиля</p>' : ''}`
              : ''
          }
        </div>`
    } else if (t === 'students') {
      const items = state.adminStudents.items || []
      const teachersAll = state.adminTeachers.items || []
      const stu = state.adminStudents.status
      const showLoading = stu === 'loading' || stu === 'idle'
      content =
        hdr(
          `Ученики${items.length ? ` (${items.length})` : ''}`,
          false,
          '',
          `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`,
        ) +
        `<div class="scr" style="padding:12px">
          ${showLoading ? '<p class="empty">Загрузка…</p>' : ''}
          ${stu === 'error' ? `<p class="empty">${esc(state.adminStudents.error)}</p>` : ''}
          ${items.length
            ? items
                .map((s) => {
                  const pendingHw = Number(s.pending_homeworks_count || 0)
                  const avg = s.average_rating != null ? Number(s.average_rating).toFixed(2) : '—'
                  const track = s.student_track || 'student'
                  const tLine = (s.teachers || []).map((x) => x.full_name).join(', ') || 'не назначен'
                  const editOpen = state.adminEditOpenId === s.id
                  const teachersHtml = teachersAll
                    .map((tt) => {
                      const cnt = Number(tt.students_count ?? 0)
                      const checked = (s.teacher_ids || []).includes(tt.id)
                      return `<label class="tcb"><input type="checkbox" class="aas-cb-${s.id}" value="${tt.id}" ${
                        checked ? 'checked' : ''
                      }><span class="tcb-box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#080808" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div class="tcb-info"><div class="tcb-name">${esc(tt.full_name)}</div><div class="tcb-sub">Учеников: ${cnt}</div></div></label>`
                    })
                    .join('')
                  return `<div class="card" data-student-name="${esc(s.full_name)}" data-student-track="${esc(track)}" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="position:relative;overflow:hidden;width:44px;height:44px;border-radius:50%;background:rgba(201,162,39,.12);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--gold);flex-shrink:0">${esc(initialsFromName(s.full_name))}${studentAvatarImg(s, getStudentAvatarUrl)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px;font-family:var(--font-body)">${esc(s.full_name)}</div>
                <div style="font-size:10px;color:var(--dim);font-family:var(--font-body);line-height:1.5;margin-top:3px">
                  ${esc(s.phone || '—')} · ${esc(studentStatusRu(s.status))} · ${esc(studentTrackRu(track))} · ${esc(s.lessons_count ?? '—')} зан.${pendingHw ? ` · <span style="color:var(--warn)">ДЗ: ${pendingHw}</span>` : ''}<br>
                  Преп.: <span style="color:${(s.teachers || []).length ? 'var(--text)' : 'var(--warn)'}">${esc(tLine)}</span><br>
                  Ср. балл: <span style="color:var(--gold)">${esc(avg)}</span>
                </div>
              </div>
            </div>
            <div style="display:flex;gap:5px;margin-top:10px;flex-wrap:wrap">
              <button class="btn bs" title="Профиль" onclick="window.__ba_adminOpenStudent(${s.id})">${ICO.eye}</button>
              <button class="btn bs" onclick="window.__ba_adminToggleEdit(${s.id})">${ICO.gear} Настроить</button>
              <button class="btn bs" onclick="window.__ba_adminChatFromList(${s.id})">${ICO.chat}</button>
            </div>
            <div id="admin-edit-${s.id}" style="display:${editOpen ? 'block' : 'none'};margin-top:10px;padding:12px;background:linear-gradient(135deg,rgba(201,162,39,.06) 0%,rgba(201,162,39,.02) 100%);border:1px solid var(--border);border-radius:16px">
              <div style="margin-bottom:8px"><div style="font-size:10px;color:var(--dim);font-family:var(--font-body);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Преподаватели</div>
                <div class="tcb-wrap">${teachersHtml || '<p class="empty" style="padding:8px;font-size:11px">Нет преподавателей</p>'}</div>
              </div>
              <input class="inp" id="aas-lessons-${s.id}" type="number" min="0" placeholder="Кол-во занятий" value="${esc(String(s.lessons_count ?? ''))}" style="font-size:11px;margin-bottom:6px">
              <label for="aas-track-${s.id}" class="stat-label" style="display:block;margin:8px 0 5px">Категория ученика</label>
              <select class="inp" id="aas-track-${s.id}" style="font-size:11px;margin-bottom:8px">
                <option value="student" ${track === 'student' ? 'selected' : ''}>Ученик</option>
                <option value="intern" ${track === 'intern' ? 'selected' : ''}>Стажёр</option>
                <option value="barber" ${track === 'barber' ? 'selected' : ''}>Барбер</option>
              </select>
              <div style="display:flex;gap:5px">
                <button class="btn bf bs" style="flex:1" onclick="window.__ba_adminSaveInline(${s.id})">${ICO.check} Сохранить</button>
                <button class="btn bs" style="flex:1" onclick="window.__ba_adminToggleEdit(${s.id})">Отмена</button>
              </div>
            </div>
          </div>`
                })
                .join('')
            : stu === 'loaded'
              ? '<p class="empty">Нет учеников</p>'
              : ''}
        </div>`
    } else if (t === 'teachers') {
      const items = state.adminTeachers.items || []
      content =
        hdr('Преподаватели', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr" style="padding:12px">
          ${state.adminTeachers.status === 'loading' ? '<p class="empty">Загрузка…</p>' : ''}
          ${state.adminTeachers.status === 'error' ? `<p class="empty">${esc(state.adminTeachers.error)}</p>` : ''}
          ${items.length
            ? items
                .map(
                  (t) =>
                    `<div class="card" style="margin-bottom:8px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="window.__ba_adminOpenTeacher(${t.id})">
            <div style="width:44px;height:44px;border-radius:50%;background:rgba(201,162,39,.12);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--gold);flex-shrink:0">${esc(initialsFromName(t.full_name))}</div>
            <div style="flex:1;min-width:0">
              <div style="font-family:var(--font-body);font-weight:800;font-size:12px">${esc(t.full_name)}</div>
              <div style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin-top:4px">учеников: ${esc(t.students_count)}</div>
            </div>
            <div style="color:var(--dim);font-size:22px;line-height:1;flex-shrink:0;font-weight:300">›</div>
          </div>`,
                )
                .join('')
            : state.adminTeachers.status === 'loaded'
              ? '<p class="empty">Нет преподавателей</p>'
              : ''}
        </div>`
    } else if (t === 'notifs') {
      content =
        hdr('Уведомления', false, '', `<button class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`) +
        `<div class="scr">${renderNotifs()}</div>`
    }
    return (
      content +
      tabBar(
        [
          { k: 'pending', i: ICO.inbox, l: 'Заявки', c: pendingCount },
          { k: 'feedback', i: ICO.chat, l: 'Отзывы' },
          { k: 'students', i: ICO.users, l: 'Ученики' },
          { k: 'teachers', i: ICO.book, l: 'Преп.' },
          { k: 'notifs', i: ICO.bell, l: 'Увед.', c: unread },
        ],
        t,
      )
    )
  }

  const renderGuestPortfolio = () => {
    const gp = state.guestPortfolio
    const allStudents = gp.students || []
    const visibleStudents = allStudents.filter((s) => (s.student_track || 'student') === state.guestTrack)
    const categoryTabs = `<nav class="ba-student-categories" aria-label="Категории учеников">${[['student','Ученик'],['intern','Стажёр'],['barber','Барбер']].map(([key,label]) => `<button type="button" class="btn bs ${state.guestTrack === key ? 'bf' : ''}" aria-pressed="${state.guestTrack === key}" onclick="window.__ba_guestTrack('${key}')">${label}<span>${allStudents.filter((s) => (s.student_track || 'student') === key).length}</span></button>`).join('')}</nav>`
    const canBack = state.stack.length > 0
    const logoutBtn = `<button type="button" class="hdr-btn" style="color:var(--text)" onclick="window.__ba_toggleTheme()">◐</button><button type="button" class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_exitGuest()">${ICO.logout}</button>`
    const demoImages = ['/demo-homework-fade.png', '/demo-homework-crop.png', '/demo-homework-beard.png']
    const inner =
      gp.status === 'loading' || gp.status === 'idle'
        ? '<div class="card" style="padding:30px;text-align:center"><p class="empty" style="margin:0">Загружаем работы учеников…</p></div>'
        : gp.status === 'error'
          ? `<p class="empty">${esc(gp.error)}</p>`
          : !visibleStudents.length
            ? '<p class="empty">В этой категории пока нет профилей.</p>'
            : `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${visibleStudents
                .map((s, index) => {
                  const avg = s.average_rating != null ? Number(s.average_rating).toFixed(1) : '—'
                  return `<article class="card" style="padding:0;overflow:hidden;cursor:pointer;border-radius:20px" onclick="window.__ba_guestOpenStudent(${s.id})">
                    <div style="position:relative;height:150px;background:var(--gold-dim);overflow:hidden">
                      ${studentAvatarImg(s, getGuestStudentAvatarUrl, { rounded: false }) || `<img src="${demoImages[index % demoImages.length]}" alt="Работа ученика ${esc(s.full_name)}" style="width:100%;height:100%;object-fit:cover">`}
                      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 48%,rgba(0,0,0,.62) 100%)"></div>
                      <span style="position:absolute;left:10px;bottom:9px;color:#fff;font-family:var(--font-body);font-size:10px">${esc(s.works_count || 0)} работ</span>
                    </div>
                    <div style="padding:12px">
                      <div style="font-weight:700;font-size:13px;line-height:1.25">${esc(s.full_name)}</div>
                      <div style="display:flex;justify-content:space-between;gap:6px;margin-top:7px;color:var(--dim);font-family:var(--font-body);font-size:9px"><span>★ ${esc(avg)}</span><span>🚇 ${esc(s.metro || '—')}</span></div>
                    </div>
                  </article>`
                })
                .join('')}</div>`
    return `<div class="scr fi" style="padding:0 0 24px">
      <section style="padding:18px 16px 28px;background:linear-gradient(145deg,var(--card) 0%,var(--bg) 100%);border-radius:0 0 28px 28px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
          <img src="/academy-role-logo.jpg" alt="MADCAP Academy" style="width:48px;height:48px;border-radius:50%;object-fit:cover;box-shadow:0 5px 18px rgba(0,0,0,.14)">
          <div style="display:flex;align-items:center">${canBack ? `<button class="hdr-btn" onclick="window.__ba_back()">${ICO.back}</button>` : ''}${logoutBtn}</div>
        </div>
        <div style="font-family:var(--font-body);font-size:10px;letter-spacing:1.5px;color:var(--gold);text-transform:uppercase;margin-bottom:8px">MADCAP ACADEMY</div>
        <h1 style="font-size:31px;line-height:1.05;margin:0 0 10px;letter-spacing:-.7px">Работы наших<br>учеников</h1>
        <p style="font-family:var(--font-body);font-size:12px;line-height:1.6;color:var(--dim);margin:0;max-width:350px">Посмотрите путь учеников, их учебные работы и результаты в профессии барбера.</p>
      </section>
      <div style="padding:18px 14px 0">
        <div style="display:flex;justify-content:space-between;align-items:end;margin-bottom:13px"><div><h2 style="font-size:18px;margin:0">Портфолио</h2><p style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin:4px 0 0">Выберите ученика, чтобы открыть его работы</p></div><span style="font-family:var(--font-body);font-size:10px;color:var(--gold)">${esc((gp.students || []).length)} профилей</span></div>
        ${categoryTabs}${inner}
      </div>
    </div>`
  }

  const renderGuestStudent = () => {
    const gs = state.guestStudentProfile
    if (gs.status === 'loading') {
      return `${hdr('Ученик', true, 'window.__ba_back()', '')}<div class="scr fi" style="padding:14px"><p class="empty">Загрузка…</p></div>`
    }
    const st = gs.student
    const teachersLine = (st?.teachers || []).map((x) => x.full_name).filter(Boolean).join(', ') || '—'
    const avg = st?.average_rating != null ? Number(st.average_rating).toFixed(2) : '—'
    const track = st?.student_track || 'student'
    const isDemoGuest = import.meta.env.DEV && Number(state.appUserId) === LOCAL_PREVIEW_GUEST_ID
    const profile =
      gs.status === 'loaded' &&
      st &&
      `<section style="position:relative;min-height:330px;overflow:hidden;background:#17130e;border-radius:0 0 28px 28px">
        ${studentAvatarImg(st, getGuestStudentAvatarUrl, { rounded: false }) || `<img src="/demo-student-barber.png" alt="Портфолио ${esc(st.full_name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`}
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04) 25%,rgba(0,0,0,.88) 100%)"></div>
        <img src="/academy-role-logo.jpg" alt="MADCAP Academy" style="position:absolute;top:16px;left:16px;width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.65)">
        <button class="hdr-btn" style="position:absolute;top:14px;right:14px;color:#fff;background:rgba(0,0,0,.25);border-radius:50%" onclick="window.__ba_back()">${ICO.back}</button>
        <div style="position:absolute;left:20px;right:20px;bottom:46px;color:#fff">
          <div style="font-family:var(--font-body);font-size:10px;letter-spacing:1.4px;text-transform:uppercase;opacity:.82;margin-bottom:7px">MADCAP ACADEMY · УЧЕНИК</div>
          <h1 style="font-size:29px;line-height:1.05;margin:0;letter-spacing:-.6px">${esc(st.full_name)}</h1>
          <div style="margin-top:10px">${badge(studentTrackRu(track))}</div>
        </div>
      </section>
      <div class="card" style="position:relative;margin:-32px 14px 14px;border-radius:22px;box-shadow:0 12px 28px rgba(0,0,0,.18)">
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
          <div><div class="stat-label">Занятий</div><div class="stat-val">${esc(st.lessons_count ?? '—')}</div></div>
          <div><div class="stat-label">Ср. балл</div><div class="stat-val">${esc(avg)}</div></div>
          <div><div class="stat-label">Метро</div><div class="stat-val" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(st.metro || '—')}</div></div>
          <div style="grid-column:span 3"><div class="stat-label">Преподаватели</div><div style="font-size:13px;font-family:var(--font-body)">${esc(teachersLine)}</div></div>
        </div>
      </div>
      <div style="padding:0 14px">
        <section class="card" style="margin-bottom:14px;padding:18px"><h4 style="font-size:19px;margin:0 0 8px">Обо мне</h4><p style="font-family:var(--font-body);font-size:12px;line-height:1.65;color:var(--dim);margin:0">${esc(st.about_me || (isDemoGuest ? 'Я пришёл в барберинг, потому что хотел создавать стиль руками и видеть реальный результат своей работы. В MADCAP Academy отрабатываю чистые переходы, форму и сервис.' : 'Ученик пока не заполнил информацию о себе.'))}</p></section>
        <section class="card" style="padding:18px"><div style="margin-bottom:12px"><h4 style="font-size:17px;color:var(--gold);margin:0">Мои работы</h4><p style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin:4px 0 0">Учебные задания и результаты</p></div></section>
      </div>`

    const hwBlock =
      gs.status === 'loading'
        ? '<p class="empty">Загрузка…</p>'
        : gs.status === 'error'
          ? `<p class="empty">${esc(gs.error)}</p>`
          : !(gs.homeworks || []).length
            ? '<p class="empty">Нет работ</p>'
            : `<div class="grid2" style="padding:0 14px 14px;margin-top:-1px">${(gs.homeworks || [])
                .map((hw) => {
                  const title = hw.haircut_name || (hw.is_bonus ? 'Бонус' : `Урок #${hw.lesson_number ?? '—'}`)
                  const pending = hw.status === 'pending' || hw.status === 'revision'
                  const badgeHtml = pending
                    ? `<span class="badge" style="background:rgba(218,170,34,.1);color:var(--warn);border:1px solid rgba(218,170,34,.18);font-size:8px">На проверке</span>`
                    : hw.rating != null
                      ? `<div style="display:flex;align-items:center;gap:2px;margin-top:3px;color:var(--gold)">${ICO.star}<span style="font-size:11px;font-weight:700;font-family:var(--font-body)">${esc(String(hw.rating))}</span></div>`
                      : `<span class="badge" style="background:rgba(58,170,58,.12);color:var(--success);border:1px solid rgba(58,170,58,.22);font-size:8px">Проверено</span>`
                  const previewImage = ['/demo-homework-fade.png', '/demo-homework-crop.png', '/demo-homework-beard.png'][Number(hw.id) % 3]
                  return `<article class="card" style="cursor:pointer;padding:0;overflow:hidden;border-radius:18px" onclick="window.__ba_guestOpenHw(${hw.id})">
                    <img src="${previewImage}" alt="${esc(title)}" style="width:100%;height:112px;object-fit:cover;display:block">
                    <div style="padding:10px"><div style="font-size:11px;font-weight:700;font-family:var(--font-body);margin-bottom:4px">${esc(title)}</div><div style="font-size:9px;color:var(--dim);font-family:var(--font-body)">${esc(({photo:'Фотография',video:'Видео',document:'Документ',text:'Описание'})[hw.content_type] || 'Работа')}</div><div style="margin-top:8px">${badgeHtml}</div></div>
                  </article>`
                })
                .join('')}</div>`

    return `<div class="scr fi">${profile || ''}${hwBlock}</div>`
  }

  window.__ba_guestTrack = (track) => {
    if (!['student', 'intern', 'barber'].includes(track)) return
    state.guestTrack = track
    const scroll = root.querySelector('.scr')?.scrollTop || 0
    render()
    const screen = root.querySelector('.scr')
    if (screen) screen.scrollTop = scroll
  }

  const renderGuestHwView = () => {
    const hw = state.selectedHomework
    if (!hw) return ''
    const title = hw.haircut_name || (hw.is_bonus ? 'Бонус' : `Урок #${hw.lesson_number ?? '—'}`)
    const photoItems = homeworkPhotoItems(hw, getGuestHomeworkFileUrl, getGuestHomeworkAttachmentFileUrl)
    state.photoItems = photoItems
    const photoStrip = renderHomeworkPhotoStrip(photoItems)
    const fileBtns = renderHomeworkMediaButtons(
      hw,
      (id) => getGuestHomeworkFileUrl(id, false),
      (hid, aid) => getGuestHomeworkAttachmentFileUrl(hid, aid, false),
      { skipPhotos: photoItems.length > 0 },
    )
    const ratingBlock =
      hw.rating != null
        ? `<div class="card" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:5px"><span style="color:var(--gold)">${ICO.star}</span><span style="font-size:20px;font-weight:700;color:var(--gold)">${esc(String(hw.rating))}</span><span style="font-size:11px;color:var(--dim);font-family:var(--font-body)">/5</span></div>
            ${hw.review_comment ? `<p style="font-size:12px;font-family:var(--font-body);line-height:1.5">${esc(hw.review_comment)}</p>` : ''}
            ${hw.reviewer_name ? `<div style="font-size:9px;color:var(--dim);margin-top:6px;font-family:var(--font-body)">${esc(hw.reviewer_name)}</div>` : ''}
          </div>`
        : ''
    return `${hdr('Работа', true, 'window.__ba_back()', '')}
      <div class="scr fi" style="padding:14px">
        ${photoStrip}
        <div class="card">
          <div style="font-size:14px;font-weight:700;margin-bottom:6px">${esc(title)}</div>
          ${hw.text_content ? `<p style="font-family:var(--font-body);font-size:12px;line-height:1.5">${esc(hw.text_content)}</p>` : ''}
          <div style="height:10px"></div>
          ${ratingBlock}
          ${fileBtns}
        </div>
      </div>
      ${renderLightbox()}`
  }

  const renderRegisterRole = () => {
    const rows = [
      { r: 'student', l: 'Ученик', i: ICO.user, d: 'Обучение и портфолио' },
      { r: 'teacher', l: 'Преподаватель', i: ICO.book, d: 'Проверка заданий' },
      { r: 'admin', l: 'Администратор', i: ICO.shield, d: 'Управление академией' },
      { r: 'guest', l: 'Гость', i: ICO.eye, d: 'Просмотр портфолио' },
    ]
    const btns = rows
      .map(
        (x) =>
          `<button type="button" onclick="window.__ba_pickRegisterRole('${x.r}')"
      style="width:100%;max-width:300px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;gap:14px;text-align:left;padding:14px 18px;border-radius:16px;border:1.5px solid var(--gold);background:linear-gradient(135deg,rgba(201,162,39,.2) 0%,rgba(201,162,39,.06) 100%);box-shadow:0 0 18px rgba(201,162,39,.18),inset 0 1px 0 rgba(201,162,39,.15);transition:all .18s">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;color:#080808;flex-shrink:0;box-shadow:0 0 12px rgba(201,162,39,.5)">${x.i}</div>
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--gold);font-family:var(--font-body);letter-spacing:1.5px;text-transform:uppercase">${esc(x.l)}</div>
        <div style="font-size:11px;color:rgba(201,162,39,.6);font-family:var(--font-body);margin-top:1px;letter-spacing:.3px">${esc(x.d)}</div>
      </div>
    </button>`,
      )
      .join('')
    return `<div class="scr fi" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;min-height:100%">
    <div style="text-align:center;margin-bottom:24px">
      <img src="/academy-role-logo.jpg" alt="MADCAP Academy" width="160" height="160" style="width:160px;height:160px;margin:0 auto;border-radius:50%;object-fit:cover;display:block;box-shadow:0 0 30px rgba(201,162,39,.3)" />
      <div class="gl" style="width:80px;margin:12px auto"></div>
      <p style="color:var(--dim);font-family:var(--font-body);font-size:11px;letter-spacing:1.5px;text-transform:uppercase">Выберите роль</p>
    </div>
    ${btns}
    ${renderVkBindCardHtml()}
    <div style="margin-top:16px"><button type="button" class="hdr-btn" style="border:none;background:transparent;color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button></div>
  </div>`
  }

  const renderDemoHome = () => {
    const roles = [
      { role: 'student', title: 'Ученик', eyebrow: 'Учёба и портфолио', icon: ICO.user, text: 'Профиль, домашние задания, преподаватель, комментарии и уведомления.' },
      { role: 'teacher', title: 'Преподаватель', eyebrow: 'Проверка работ', icon: ICO.book, text: 'Очередь заданий, ученики, оценки, комментарии и личный профиль.' },
      { role: 'admin', title: 'Администратор', eyebrow: 'Управление академией', icon: ICO.shield, text: 'Заявки, ученики, преподаватели, карточки и системные уведомления.' },
      { role: 'guest', title: 'Гость', eyebrow: 'Публичная витрина', icon: ICO.eye, text: 'Портфолио учеников без телефонов, никнеймов и личных данных.' },
    ]
    return `<div class="scr fi" style="padding:0 0 30px">
      <section style="position:relative;min-height:380px;padding:22px 20px 34px;overflow:hidden;background:radial-gradient(circle at 50% 5%,rgba(201,162,39,.23),transparent 38%),linear-gradient(145deg,#2a2111 0%,#080808 77%);border-radius:0 0 36px 36px;color:#fff;text-align:center">
        <div style="position:absolute;width:300px;height:300px;border-radius:50%;right:-155px;top:-145px;background:rgba(201,162,39,.16);filter:blur(3px)"></div>
        <div style="position:absolute;width:180px;height:180px;border-radius:50%;left:-115px;bottom:-112px;border:1px solid rgba(201,162,39,.18)"></div>
        <button class="hdr-btn" style="position:absolute;z-index:1;top:18px;right:18px;color:#fff;background:rgba(255,255,255,.12);border-radius:50%" onclick="window.__ba_toggleTheme()">◐</button>
        <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center">
          <div style="width:118px;height:118px;border-radius:50%;padding:5px;margin:16px auto 20px;background:linear-gradient(135deg,#f6dc72,#9a7415 50%,#fff1a5);box-shadow:0 14px 38px rgba(0,0,0,.38),0 0 0 8px rgba(255,255,255,.055)">
            <img src="/academy-role-logo.jpg" alt="MADCAP Academy" style="width:100%;height:100%;display:block;border-radius:50%;object-fit:cover;border:2px solid #111">
          </div>
          <div style="font-family:var(--font-body);font-size:10px;letter-spacing:2.3px;color:#e2c253;text-transform:uppercase;margin-bottom:12px">MADCAP ACADEMY</div>
          <h1 style="font-size:40px;line-height:.98;margin:0 0 14px;letter-spacing:-1.25px;text-wrap:balance">Дневник<br>академии</h1>
          <div style="width:38px;height:2px;background:var(--gold);border-radius:99px;margin:0 auto 13px"></div>
          <p style="font-family:var(--font-body);font-size:11px;line-height:1.6;color:rgba(255,255,255,.76);margin:0;max-width:290px">Ваше пространство для роста, учебных работ и связи с академией.</p>
        </div>
      </section>
      <div style="padding:20px 14px 0">
        <div style="margin-bottom:14px"><h2 style="font-size:19px;margin:0">Посмотреть приложение</h2><p style="font-family:var(--font-body);font-size:10px;color:var(--dim);margin:4px 0 0">Все разделы заполнены демонстрационными данными</p></div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
          ${roles.map((item) => `<button type="button" class="card" onclick="window.__ba_openDemoRole('${item.role}')" style="appearance:none;text-align:left;cursor:pointer;padding:16px;min-height:178px;border-radius:21px;color:var(--text)">
            <span style="width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--gold);color:#111;margin-bottom:24px">${item.icon}</span>
            <span style="display:block;font-family:var(--font-body);font-size:8px;letter-spacing:1px;color:var(--gold);text-transform:uppercase;margin-bottom:5px">${esc(item.eyebrow)}</span>
            <strong style="display:block;font-size:15px;margin-bottom:7px">${esc(item.title)}</strong>
            <span style="display:block;font-family:var(--font-body);font-size:9px;line-height:1.5;color:var(--dim)">${esc(item.text)}</span>
          </button>`).join('')}
        </div>
        <section class="card" style="margin-top:14px;padding:18px;background:linear-gradient(135deg,var(--card),var(--gold-dim))">
          <div style="font-size:15px;font-weight:700;margin-bottom:6px">Как будет работать готовый сайт</div>
          <p style="font-family:var(--font-body);font-size:10px;line-height:1.55;color:var(--dim);margin:0">Пользователь входит через Telegram или VK, а система автоматически открывает доступную ему роль. Гостевая витрина работает без доступа к контактам учеников.</p>
        </section>
      </div>
    </div>`
  }

  const renderWebsiteLogin = () => {
    const login = state.webLogin
    const waiting = login.status === 'waiting'
    const busy = login.status === 'starting'
    return `<div class="scr fi" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;min-height:100%">
      <div style="text-align:center;max-width:340px">
        <img src="/academy-role-logo.jpg" alt="MADCAP Academy" width="128" height="128" style="width:128px;height:128px;margin:0 auto 18px;border-radius:50%;object-fit:cover;display:block;box-shadow:0 0 30px rgba(201,162,39,.3)" />
        <h1 style="font-size:22px;margin:0 0 10px;color:var(--gold)">Дневник академии</h1>
        <p style="font-family:var(--font-body);font-size:12px;line-height:1.55;color:var(--dim);margin:0 0 20px">Войдите через аккаунт, который уже связан с академией.</p>
        ${waiting ? `<div class="card" style="margin-bottom:12px"><p style="font-family:var(--font-body);font-size:12px;line-height:1.55;margin:0">Подтвердите вход в ${login.provider === 'telegram' ? 'Telegram' : 'VK'}. Эта страница откроет дневник сама.</p></div>` : ''}
        ${login.error ? `<p style="font-family:var(--font-body);font-size:12px;color:var(--danger);margin:0 0 12px">${esc(login.error)}</p>` : ''}
        <button type="button" class="btn bf btn-w" style="margin-bottom:10px" ${busy || waiting ? 'disabled' : ''} onclick="window.__ba_startWebsiteLogin('telegram')">Войти через Telegram</button>
        <button type="button" class="btn bs btn-w" ${busy || waiting ? 'disabled' : ''} onclick="window.__ba_startWebsiteLogin('vk')">Войти через VK</button>
        <div style="display:flex;align-items:center;gap:10px;margin:18px 0;color:var(--dim);font-family:var(--font-body);font-size:9px"><span style="height:1px;background:var(--border);flex:1"></span>или без регистрации<span style="height:1px;background:var(--border);flex:1"></span></div>
        <button type="button" class="btn bs btn-w" ${busy || waiting ? 'disabled' : ''} onclick="window.location.assign('?guest=1')">Посмотреть работы как гость</button>
        ${waiting ? '<button type="button" class="btn" style="margin-top:12px" onclick="window.__ba_cancelWebsiteLogin()">Отменить</button>' : ''}
      </div>
    </div>`
  }

  const renderRegisterFlow = () => {
    const role = state.registerRole
    const tab = state.registerTab === 'login' ? 'login' : 'reg'
    const hdrLogout = `<button type="button" class="hdr-btn" style="color:var(--dim)" onclick="window.__ba_logout()">${ICO.logout}</button>`

    if (!role) return renderRegisterRole()

    if (role === 'guest') {
      return renderGuestPortfolio()
    }

    if (role === 'admin') {
      return (
        hdr('Администратор', true, 'window.__ba_back()', hdrLogout) +
        `<div class="scr fi" style="padding:20px">
          <div style="max-width:340px;margin:0 auto">
          ${renderVkBindCardHtml()}
          <div class="card" style="max-width:340px;margin:0 auto">
            <p style="font-family:var(--font-body);font-size:12px;line-height:1.5;color:var(--gold)">
              Если права уже выданы, но вход не открывается, нажмите «Проверить снова».
            </p>
            <div style="height:14px"></div>
            <button type="button" class="btn bf btn-w" onclick="window.__ba_retry()">Проверить снова</button>
          </div>
          </div>
        </div>`
      )
    }

    const title = role === 'teacher' ? 'Преподаватель' : 'Ученик'

    if (role === 'teacher' && state.teacherApplicationSent) {
      return (
        hdr(title, true, 'window.__ba_back()', hdrLogout) +
        `<div class="scr fi" style="padding:20px">
          <div style="max-width:340px;margin:0 auto;text-align:center;padding:28px 12px">
            <div style="width:52px;height:52px;border-radius:50%;background:var(--gold-dim);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:var(--gold);box-shadow:0 0 20px rgba(201,162,39,.3)">${ICO.clock}</div>
            <p style="color:var(--gold);font-family:var(--font-body);font-size:14px;font-weight:700;line-height:1.6">Заявка отправлена!<br>Ожидайте ответа администратора.</p>
            <button type="button" class="btn bs" style="margin-top:16px" onclick="window.__ba_back()">Назад</button>
          </div>
        </div>`
      )
    }

    const tabLoginCls = tab === 'login' ? 'btn bf' : 'btn'
    const tabRegCls = tab === 'reg' ? 'btn bf' : 'btn'

    let inner = ''
    if (tab === 'login') {
      inner = `<p style="color:var(--dim);font-family:var(--font-body);font-size:12px;line-height:1.55;margin-bottom:14px">
          Вы уже открыли приложение из Telegram или VK — авторизация привязана к аккаунту. Если заявку одобрили, нажмите «Проверить снова».
        </p>
        <button type="button" class="btn bf btn-w" onclick="window.__ba_retry()">Проверить снова</button>`
    } else if (role === 'teacher') {
      inner = `
        <input class="inp" id="t-fn" placeholder="Имя *" style="margin-bottom:8px">
        <input class="inp" id="t-ln" placeholder="Фамилия *" style="margin-bottom:8px">
        <input class="inp" id="t-phone" placeholder="Телефон *" style="margin-bottom:10px">
        <button type="button" class="btn bf btn-w" onclick="window.__ba_submitTeacherApp()">Отправить заявку</button>`
    } else {
      inner = `
        <input class="inp" id="r-fn" placeholder="Имя *" style="margin-bottom:8px">
        <input class="inp" id="r-ln" placeholder="Фамилия *" style="margin-bottom:8px">
        <input class="inp" id="r-phone" placeholder="Телефон *" style="margin-bottom:8px">
        <input class="inp" id="r-metro" placeholder="Станция метро" style="margin-bottom:8px">
        <input class="inp" id="r-lessons" placeholder="Количество занятий *" inputmode="numeric" style="margin-bottom:10px">
        <button type="button" class="btn bf btn-w" onclick="window.__ba_submitStudentReg()">Отправить заявку</button>`
    }

    return (
      hdr(title, true, 'window.__ba_back()', hdrLogout) +
      `<div class="scr fi" style="padding:20px">
        <div style="max-width:340px;margin:0 auto">
          ${renderVkBindCardHtml()}
          <div style="display:flex;border-radius:14px;overflow:hidden;border:1.5px solid var(--border);margin-bottom:18px">
            <button type="button" class="${tabLoginCls}" style="flex:1;border:0;border-radius:0" onclick="window.__ba_setRegisterTab('login')">Вход</button>
            <button type="button" class="${tabRegCls}" style="flex:1;border:0;border-radius:0" onclick="window.__ba_setRegisterTab('reg')">Регистрация</button>
          </div>
          <div id="login-form">${inner}</div>
        </div>
      </div>`
    )
  }

  const authImgCache = new Map()

  const loadAuthImages = () => {
    root.querySelectorAll('img[data-auth-src]').forEach((img) => {
      const src = img.dataset.authSrc
      if (!src) return
      if (authImgCache.has(src)) {
        const cached = authImgCache.get(src)
        if (cached) img.src = cached
        return
      }
      authImgCache.set(src, null)
      fetch(src, { headers: buildHeaders(state.platform) })
        .then((r) => (r.ok ? r.blob() : Promise.reject()))
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob)
          authImgCache.set(src, blobUrl)
          root.querySelectorAll('img[data-auth-src]').forEach((el) => {
            if (el.dataset.authSrc === src) el.src = blobUrl
          })
        })
        .catch(() => authImgCache.delete(src))
    })
  }

  window.__ba_openLightbox = (index) => {
    const items = state.photoItems || []
    if (!items.length) return
    state.lightbox = { items, index: Number(index) || 0 }
    render()
  }

  window.__ba_closeLightbox = () => {
    if (!state.lightbox) return
    state.lightbox = null
    render()
  }

  window.__ba_lightboxStep = (delta) => {
    const lb = state.lightbox
    if (!lb || lb.items.length < 2) return
    const total = lb.items.length
    lb.index = (lb.index + Number(delta) + total) % total
    render()
  }

  document.addEventListener('keydown', (event) => {
    if (!state.lightbox) return
    if (event.key === 'Escape') {
      event.preventDefault()
      window.__ba_closeLightbox()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      window.__ba_lightboxStep(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      window.__ba_lightboxStep(1)
    }
  })

  window.__ba_openFile = async (url) => {
    try {
      const r = await fetch(url, { headers: buildHeaders(state.platform) })
      if (!r.ok) { toast(root, 'Не удалось открыть файл'); return }
      const blob = await r.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch { toast(root, 'Не удалось открыть файл') }
  }

  window.__ba_startWebsiteLogin = (provider) => void startWebsiteLogin(provider)
  window.__ba_cancelWebsiteLogin = () => {
    state.webLogin = { status: 'idle', error: '', provider: null, token: null }
    render()
  }

  function _render() {
    if (state.scr === 'feedback') {
      const f = state.feedback
      root.innerHTML = hdr('Обратная связь', true, 'window.__ba_back()') + `<div class="scr" style="padding:14px"><section class="card" style="padding:20px">
        <h2 style="font-size:23px;margin-bottom:10px">Как проходит обучение?</h2><p style="font-size:14px;line-height:1.6;color:var(--dim);margin-bottom:18px">Расскажите, что нравится, что хотелось бы изменить или с какой проблемой вы столкнулись.</p>
        ${f.sent ? '<p role="status" style="line-height:1.6">Спасибо! Ваш отзыв отправлен администратору.</p><button class="btn bs btn-w" style="margin-top:16px" onclick="window.__ba_newFeedback()">Написать ещё</button>' : `<label for="feedback-subject" class="stat-label">О чём сообщение</label><select id="feedback-subject" class="inp" onchange="window.__ba_feedbackDraft(this.value,null)" ${f.busy ? 'disabled' : ''}>${['teacher','academy','other'].map((key) => `<option value="${key}" ${key === f.subject ? 'selected' : ''}>${feedbackSubject(key)}</option>`).join('')}</select><label for="feedback-message" class="stat-label" style="display:block;margin-top:16px">Ваши пожелания</label><textarea id="feedback-message" class="inp" rows="7" maxlength="4000" placeholder="Что мы можем улучшить?" oninput="window.__ba_feedbackDraft(null,this.value)" ${f.busy ? 'disabled' : ''}>${esc(f.message)}</textarea>
        <p style="font-size:12px;color:var(--dim);line-height:1.6;margin:12px 0">Сообщение увидит только администратор академии вместе с вашим именем. Преподаватель не увидит отзыв и не получит уведомление о нём.</p>
        ${f.error ? `<p role="alert" style="color:var(--danger);margin-bottom:12px">${esc(f.error)}</p>` : ''}<button class="btn bf btn-w" ${f.busy ? 'disabled' : ''} onclick="window.__ba_sendFeedback()">${f.busy ? 'Отправка…' : 'Отправить администратору'}</button>`}
        </section></div>`
      return
    }
    if (state.scr === 'loading') {
      root.innerHTML = `${hdr('MADCAP Academy', false, '')}
        <div class="scr" style="display:flex;align-items:center;justify-content:center">
          <div class="empty">Загружаем профиль…</div>
        </div>`
      return
    }
    if (state.scr === 'error') {
      root.innerHTML = `${hdr('Ошибка', false, '', `<button class="hdr-btn" onclick="window.__ba_logout()">${esc('⟳')}</button>`)}
        <div class="scr" style="padding:16px">
          <div class="card">
            <p style="font-family:var(--font-body);font-size:13px;line-height:1.5">${esc(state.error)}</p>
            <div style="height:12px"></div>
            <button class="btn bf btn-w" onclick="window.__ba_retry()">Повторить</button>
          </div>
        </div>`
      return
    }
    if (state.scr === 'web-login') {
      root.innerHTML = renderWebsiteLogin()
      return
    }
    if (state.scr === 'demo-home') {
      root.innerHTML = renderDemoHome()
      return
    }
    if (state.scr === 'register-role') {
      root.innerHTML = renderRegisterRole()
      return
    }
    if (state.scr === 'register-flow') {
      root.innerHTML = renderRegisterFlow()
      return
    }
    if (state.scr === 'guest') {
      root.innerHTML = renderGuestPortfolio()
      return
    }
    if (state.scr === 'guest-student') {
      root.innerHTML = renderGuestStudent()
      return
    }
    if (state.scr === 'guest-hw-view') {
      root.innerHTML = renderGuestHwView()
      return
    }

    if (state.scr === 'student') {
      root.innerHTML = renderStudent()
      return
    }
    if (state.scr === 'student-works') {
      root.innerHTML = renderStudentWorks()
      return
    }
    if (state.scr === 'teacher') {
      root.innerHTML = renderTeacher()
      return
    }
    if (state.scr === 'admin') {
      root.innerHTML = renderAdmin()
      return
    }
    if (state.scr === 'admin-teacher') {
      root.innerHTML = renderAdminTeacherDetail()
      return
    }
    if (state.scr === 'hw-new') {
      root.innerHTML = renderHwNew()
      return
    }
    if (state.scr === 'hw-view') {
      root.innerHTML = renderHwView()
      return
    }
    if (state.scr === 't-student') {
      root.innerHTML = renderTeacherStudent()
      return
    }
    if (state.scr === 'teacher-chat') {
      const stn = state.selectedStudent?.full_name?.trim()
      const chatTitle = stn ? `Чат · ${stn}` : 'Чат'
      root.innerHTML =
        hdr(chatTitle, true, 'window.__ba_back()', '') + `<div class="scr fi" style="padding:0">${renderChatScreen()}</div>`
      return
    }
    if (state.scr === 'admin-student') {
      root.innerHTML = renderAdminStudentProfile()
      return
    }
    if (state.scr === 'admin-chat') {
      const stn = state.selectedStudent?.full_name?.trim()
      const chatTitle = stn ? `Чат · ${stn}` : 'Чат'
      root.innerHTML =
        hdr(chatTitle, true, 'window.__ba_back()', '') + `<div class="scr fi" style="padding:0">${renderChatScreen()}</div>`
      return
    }

    root.innerHTML = `${hdr('MADCAP Academy', false, '', '')}<div class="scr fi" style="padding:16px"><div class="card"><p style="font-family:var(--font-body);font-size:12px;color:var(--dim)">Неизвестный экран</p></div></div>`
  }

  function render() {
    _render()
    const params = new URLSearchParams(window.location.search)
    if (import.meta.env.DEV && params.get('demo') === '1' && state.scr !== 'demo-home') {
      root.insertAdjacentHTML('afterbegin', '<nav class="ba-demo-nav" aria-label="Демонстрация"><span>Демо академии</span><button type="button" class="btn bs" onclick="window.__ba_openDemoRole(\'demo\')">Все роли</button></nav>')
    }
    polishScreen()
    loadAuthImages()
  }

  function polishScreen() {
    addStudentSearch()
    const lightbox = root.querySelector('#ba-lightbox')
    if (lightbox && (state.lightbox?.items.length || 0) > 1) {
      let startX = null
      lightbox.addEventListener('touchstart', (event) => { startX = event.changedTouches[0].clientX }, { passive: true })
      lightbox.addEventListener('touchend', (event) => {
        if (startX == null) return
        const dx = event.changedTouches[0].clientX - startX
        startX = null
        if (Math.abs(dx) > 45) window.__ba_lightboxStep(dx < 0 ? 1 : -1)
      }, { passive: true })
    }
    if (state.scr === 'student' && ['home','profile'].includes(state.tab)) {
      root.querySelector('.scr')?.insertAdjacentHTML('beforeend', '<section class="card" style="margin:14px;padding:18px"><h3 style="font-size:18px;margin-bottom:8px">Ваше мнение важно</h3><p style="font-size:12px;line-height:1.5;color:var(--dim);margin-bottom:12px">Пожелания о преподавателе и академии — лично администратору.</p><button class="btn bs btn-w" onclick="window.__ba_go(\'feedback\')">Обратная связь об обучении</button></section>')
    }
    root.querySelectorAll('select[id^="aas-track-"]').forEach((select) => {
      const sid = select.id.slice('aas-track-'.length)
      const group = root.querySelector(`#admin-edit-${sid} .tcb-wrap`)
      if (!group) return
      const hint = document.createElement('p')
      hint.style.cssText = 'font-size:12px;color:var(--dim);line-height:1.5;margin:8px 0'
      select.after(hint)
      const update = () => {
        const barber = select.value === 'barber'
        group.querySelectorAll('input').forEach((input) => { input.disabled = barber })
        group.style.opacity = barber ? '.45' : '1'
        hint.textContent = barber ? 'После сохранения барбер будет откреплён от всех преподавателей. Работы и оценки сохранятся.' : 'Ученик и стажёр остаются у назначенных преподавателей. После возвращения из категории «Барбер» назначьте преподавателя заново.'
      }
      select.addEventListener('change', update)
      update()
    })
    root.querySelectorAll('[style]').forEach((el) => {
      const size = parseFloat(el.style.fontSize)
      if (size > 0 && size < 12) el.style.fontSize = '12px'
    })
    root.querySelectorAll('.card[onclick]:not(button)').forEach((el) => {
      el.setAttribute('role', 'button')
      el.tabIndex = 0
      el.onkeydown = (event) => {
        if (event.target === el && ['Enter', ' '].includes(event.key)) { event.preventDefault(); el.click() }
      }
    })
    root.querySelectorAll('button[onclick]').forEach((button) => {
      const action = button.getAttribute('onclick') || ''
      if (action.includes('__ba_toggleTheme')) button.setAttribute('aria-label', 'Сменить светлую и тёмную тему')
      else if (!button.textContent.trim() && !button.hasAttribute('aria-label')) {
        const label = action.includes('back') ? 'Назад' : action.includes('logout') || action.includes('exitGuest') ? 'Выйти' : action.includes('Chat') ? 'Открыть чат' : 'Открыть карточку'
        button.setAttribute('aria-label', label)
        button.title = label
      }
    })
    root.querySelectorAll('input,textarea,select').forEach((input) => {
      if (!input.labels?.length && !input.hasAttribute('aria-label')) input.setAttribute('aria-label', input.placeholder || 'Выберите значение')
    })
    root.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => {
        if (!img.src.endsWith('/academy-role-logo.jpg')) img.src = '/academy-role-logo.jpg'
      }, { once:true })
    })
    if (['t-student', 'admin-student', 'guest-student'].includes(state.scr)) {
      const heading = [...root.querySelectorAll('h4')].find((el) => el.textContent === 'Мои работы')
      if (heading) {
        let section = heading.closest('section')
        if (!section) {
          section = document.createElement('section')
          section.className = 'card ba-works'
          heading.parentElement.replaceWith(section)
          section.append(heading)
        } else section.classList.add('ba-works')
        const screen = root.querySelector('.scr')
        const works = [...screen.children].filter((el) => el.matches('.card[onclick],.grid2,.empty'))
        works.forEach((work) => {
          section.append(work)
          if (state.scr !== 'guest-student' && work.matches('.card[onclick]')) {
            const items = state.scr === 't-student' ? state.teacherStudentHomeworks.items : state.adminStudentProfile.homeworks
            const id = Number(work.getAttribute('onclick').match(/\((\d+)\)/)?.[1])
            const hw = (items || []).find((item) => Number(item.id) === id)
            if (!hw) return
            const meta = homeworkPortfolioPhotoMeta(hw)
            const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')
            const image = demo ? ['/demo-homework-fade.png', '/demo-homework-crop.png', '/demo-homework-beard.png'][id % 3] : null
            const media = image ? `<img src="${image}" alt="" loading="lazy">` : meta.thumbUrl ? `<img data-auth-src="${esc(meta.thumbUrl)}" alt="">` : `<span class="ba-work-placeholder">${ICO.camera}</span>`
            work.classList.add('ba-work')
            work.innerHTML = `${media}<div>${work.innerHTML}</div>`
          }
        })
      }
    }
  }

  function addStudentSearch() {
    if (state.tab !== 'students' || !['admin', 'teacher'].includes(state.scr)) return
    const saved = state.studentSearch[state.scr]
    const header = root.querySelector('.hdr')
    const screen = root.querySelector('.scr')
    if (!header || !screen) return
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'hdr-btn'
    toggle.setAttribute('aria-label', 'Найти ученика')
    toggle.setAttribute('aria-expanded', String(saved.open))
    toggle.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m15 15 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    header.insertBefore(toggle, header.lastElementChild)
    const panel = document.createElement('div')
    panel.className = 'ba-student-search'
    panel.hidden = !saved.open
    panel.innerHTML = '<div style="display:flex;gap:8px"><input class="inp" type="search" placeholder="Имя или фамилия ученика" aria-label="Имя или фамилия ученика" autocomplete="off"><button type="button" class="btn bs" aria-label="Очистить поиск">Сбросить</button></div><p role="status" aria-live="polite" style="margin-top:8px;color:var(--dim);font-size:12px"></p>'
    screen.prepend(panel)
    const categories = document.createElement('nav')
    categories.className = 'ba-student-categories'
    categories.setAttribute('aria-label', 'Категории учеников')
    const cards = [...screen.querySelectorAll('[data-student-name]')]
    categories.innerHTML = [['student','Ученик'],['intern','Стажёр'],['barber','Барбер']].map(([key,label]) => `<button type="button" class="btn bs" data-track="${key}">${label}<span>${cards.filter((card) => card.dataset.studentTrack === key).length}</span></button>`).join('')
    screen.prepend(categories)
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.setAttribute('role', 'status')
    screen.append(empty)
    const input = panel.querySelector('input')
    input.value = saved.query
    const normalize = (value) => String(value).toLocaleLowerCase('ru').replace(/ё/g, 'е').trim()
    const filter = () => {
      saved.query = input.value
      const words = normalize(input.value).split(/\s+/).filter(Boolean)
      const total = cards.filter((card) => card.dataset.studentTrack === saved.track).length
      let found = 0
      cards.forEach((card) => {
        const matches = card.dataset.studentTrack === saved.track && words.every((word) => normalize(card.dataset.studentName).includes(word))
        card.hidden = !matches
        if (matches) found++
      })
      const status = state.scr === 'admin' ? state.adminStudents.status : state.teacherStudents.status
      panel.querySelector('[role=status]').textContent = status !== 'loaded' ? '' : `Найдено: ${found} из ${total}`
      empty.hidden = status !== 'loaded' || found > 0 || cards.length === 0
      empty.textContent = words.length ? 'В этой категории никого не нашли. Измените запрос или выберите другую категорию.' : 'В этой категории пока нет учеников.'
      categories.querySelectorAll('button').forEach((button) => {
        const active = button.dataset.track === saved.track
        button.classList.toggle('bf', active)
        button.setAttribute('aria-pressed', String(active))
      })
    }
    categories.querySelectorAll('button').forEach((button) => {
      button.onclick = () => { saved.track = button.dataset.track; filter() }
    })
    input.oninput = filter
    input.onkeydown = (event) => {
      if (event.key === 'Escape') { input.value = ''; filter() }
      if (event.key === 'Enter') {
        event.preventDefault()
        const cards = [...screen.querySelectorAll('[data-student-name]')].filter((card) => !card.hidden)
        if (cards.length === 1) {
          const profileButton = cards[0].querySelector('[onclick*="__ba_adminOpenStudent"]')
          ;(profileButton || cards[0]).click()
        }
      }
    }
    panel.querySelector('button').onclick = () => { input.value = ''; filter(); input.focus() }
    toggle.onclick = () => {
      saved.open = !saved.open
      panel.hidden = !saved.open
      toggle.setAttribute('aria-expanded', String(saved.open))
      if (saved.open) { input.focus(); input.select() }
      else { input.value = ''; filter() }
    }
    filter()
  }

  window.__ba_openDemoRole = (role) => {
    const selected = ['student', 'teacher', 'admin', 'guest'].includes(String(role)) ? String(role) : 'demo'
    window.location.assign(selected === 'demo' ? '?preview=demo' : `?preview=${selected}&demo=1`)
  }

  window.__ba_feedbackDraft = (subject, message) => {
    if (state.feedback.busy) return
    if (subject !== null) state.feedback.subject = subject
    if (message !== null) state.feedback.message = message
    state.feedback.key = null
  }
  window.__ba_newFeedback = () => {
    state.feedback = { subject: 'teacher', message: '', key: null, busy: false, sent: false, error: '' }
    render()
  }
  window.__ba_sendFeedback = async () => {
    const f = state.feedback
    if (f.busy) return
    if (!f.message.trim()) {
      f.error = 'Напишите сообщение перед отправкой.'
      render()
      return
    }
    f.key ||= crypto.randomUUID()
    f.busy = true
    f.error = ''
    render()
    try {
      await apiPost(state.platform, '/api/student/feedback', {
        telegram_id: state.appUserId,
        subject: f.subject,
        message: f.message,
        request_key: f.key,
      })
      f.sent = true
      f.message = ''
    } catch (e) {
      f.error = e?.message || 'Не удалось отправить. Попробуйте ещё раз.'
    } finally {
      f.busy = false
      render()
    }
  }
  async function loadAdminFeedback(more = false) {
    const f = state.adminFeedback
    if (f.busy) return
    f.busy = true
    f.error = ''
    render()
    try {
      const before = more && f.next ? `&before=${encodeURIComponent(f.next)}` : ''
      const data = await apiGet(state.platform, `/api/admin/feedback?telegram_id=${encodeURIComponent(state.appUserId)}${before}`)
      f.items = more ? [...f.items, ...(data.items || [])] : data.items || []
      f.next = data.next || null
    } catch (e) {
      f.error = e?.message || 'Не удалось загрузить отзывы.'
    } finally {
      f.busy = false
      render()
    }
  }
  window.__ba_loadFeedback = (more) => void loadAdminFeedback(Boolean(more))

  window.__ba_retry = () => {
    go('loading')
    void bootstrap()
  }
  const submitAdminTeacherApp = async (applicationId, action) => {
    try {
      await apiPost(state.platform, '/api/admin/teacher-applications', {
        telegram_id: state.appUserId,
        application_id: Number(applicationId),
        action: action === 'approve' ? 'approve' : 'reject',
      })
      toast(root, 'Готово')
      await loadAdminModeration()
    } catch (e) {
      toast(root, e?.message || 'Ошибка')
    }
  }

  window.__ba_pickRegisterRole = (role) => {
    const r = String(role)
    if (r === 'guest') {
      try {
        sessionStorage.setItem(GUEST_STORAGE_KEY, '1')
      } catch {
        // ignore
      }
      state.isGuestMode = true
      state.registerRole = null
      state.registerTab = 'reg'
      state.teacherApplicationSent = false
      go('guest')
      void loadGuestPortfolio()
      return
    }
    state.registerRole = r
    state.registerTab = 'reg'
    state.teacherApplicationSent = false
    go('register-flow')
  }
  window.__ba_guestOpenStudent = (studentId) => {
    go('guest-student')
    void loadGuestStudentPortfolio(studentId)
  }
  window.__ba_guestOpenHw = (hwId) => {
    const id = Number(hwId)
    const hw = (state.guestStudentProfile.homeworks || []).find((x) => Number(x.id) === id)
    if (!hw) return
    state.selectedHomework = hw
    go('guest-hw-view')
  }
  window.__ba_exitGuest = () => {
    if (new URLSearchParams(window.location.search).get('guest') === '1') {
      window.location.assign(window.location.pathname)
      return
    }
    try {
      sessionStorage.removeItem(GUEST_STORAGE_KEY)
    } catch {
      // ignore
    }
    state.isGuestMode = false
    state.guestPortfolio = { status: 'idle', students: [], error: '' }
    state.guestStudentProfile = { status: 'idle', student: null, homeworks: [], error: '' }
    state.selectedHomework = null
    state.scr = 'register-role'
    state.stack = []
    render()
    syncTelegramBackButton()
  }
  window.__ba_adminTeacherApp = (applicationId, action) => void submitAdminTeacherApp(applicationId, action)
  window.__ba_setRegisterTab = (t) => {
    state.registerTab = t === 'login' ? 'login' : 'reg'
    render()
  }
  window.__ba_submitStudentReg = () => void submitStudentRegistration()
  window.__ba_submitTeacherApp = () => void submitTeacherApplication()
  window.__ba_generateVkLinkCode = () => void generateVkLinkCode()
  window.__ba_confirmVkBind = () => void confirmVkBind()
  window.__ba_logout = () => logout()
  window.__ba_back = () => back()

  window.__ba_changeAvatar = () => {
    let input = document.getElementById('__ba_avatar_input')
    if (!input) {
      input = document.createElement('input')
      input.type = 'file'
      input.id = '__ba_avatar_input'
      input.accept = 'image/*'
      input.style.display = 'none'
      document.body.appendChild(input)
      input.addEventListener('change', async () => {
        const file = input.files?.[0]
        if (!file) return
        input.value = ''
        const fd = new FormData()
        fd.append('file', file)
        try {
          const avatarHeaders = { ...buildHeaders(state.platform) }
          delete avatarHeaders['Content-Type']
          const r = await fetch(apiUrl(`/api/student/me/avatar?telegram_id=${encodeURIComponent(state.appUserId)}`), {
            method: 'POST',
            headers: avatarHeaders,
            body: fd,
          })
          const json = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(json.error || 'Ошибка загрузки')
          if (state.session?.student) state.session.student.has_avatar = true
          authImgCache.delete(apiUrl(`/api/student/me/avatar?telegram_id=${encodeURIComponent(state.appUserId)}`))
          render()
          toast(root, 'Аватар обновлён')
        } catch (e) {
          toast(root, e?.message || 'Не удалось загрузить фото')
        }
      })
    }
    input.click()
  }

  window.__ba_openProfileEdit = () => {
    state.profileEditModal = { open: true, busy: false, error: '' }
    render()
  }
  window.__ba_closeProfileEdit = () => {
    state.profileEditModal = { open: false, busy: false, error: '' }
    render()
  }
  window.__ba_submitProfileEdit = async () => {
    const fn = document.getElementById('pe-fn')?.value?.trim()
    const ln = document.getElementById('pe-ln')?.value?.trim()
    const phone = document.getElementById('pe-phone')?.value?.trim()
    const metro = document.getElementById('pe-metro')?.value?.trim()
    if (!fn || !ln || !phone) {
      state.profileEditModal = { ...state.profileEditModal, error: 'Заполните обязательные поля (имя, фамилия, телефон).' }
      render()
      return
    }
    state.profileEditModal = { ...state.profileEditModal, busy: true, error: '' }
    render()
    try {
      await apiPost(state.platform, '/api/student/profile-edit', {
        telegram_id: state.appUserId,
        full_name: [fn, ln].filter(Boolean).join(' ').trim(),
        phone,
        metro: metro || undefined,
      })
      state.profileEditModal = { open: false, busy: false, error: '' }
      render()
      toast(root, 'Заявка отправлена, ожидайте одобрения')
    } catch (e) {
      state.profileEditModal = { ...state.profileEditModal, busy: false, error: e?.message || 'Не удалось отправить' }
      render()
    }
  }
  const saveHwEditFields = () => {
    const haircut = document.getElementById('hwe-haircut')
    const text = document.getElementById('hwe-text')
    if (haircut != null) state.hwEditModal = { ...state.hwEditModal, savedHaircut: haircut.value }
    if (text != null) state.hwEditModal = { ...state.hwEditModal, savedText: text.value }
  }

  window.__ba_openHwEdit = (hwId) => {
    state.hwEditModal = { open: true, homeworkId: Number(hwId), busy: false, error: '', removedPrimary: false, removedAttachmentIds: [], newPhotos: [], savedText: null, savedHaircut: null }
    render()
  }
  window.__ba_closeHwEdit = () => {
    state.hwEditModal.newPhotos.forEach((p) => URL.revokeObjectURL(p.url))
    state.hwEditModal = { open: false, homeworkId: null, busy: false, error: '', removedPrimary: false, removedAttachmentIds: [], newPhotos: [], savedText: null, savedHaircut: null }
    render()
  }
  window.__ba_hwEditRemovePrimary = () => {
    saveHwEditFields()
    state.hwEditModal = { ...state.hwEditModal, removedPrimary: true }
    render()
  }
  window.__ba_hwEditRemoveAttachment = (id) => {
    saveHwEditFields()
    state.hwEditModal = { ...state.hwEditModal, removedAttachmentIds: [...state.hwEditModal.removedAttachmentIds, Number(id)] }
    render()
  }
  window.__ba_hwEditRemoveNew = (idx) => {
    saveHwEditFields()
    const photos = [...state.hwEditModal.newPhotos]
    URL.revokeObjectURL(photos[idx]?.url)
    photos.splice(idx, 1)
    state.hwEditModal = { ...state.hwEditModal, newPhotos: photos }
    render()
  }
  window.__ba_hwEditAddPhotos = (input) => {
    saveHwEditFields()
    const files = Array.from(input.files || [])
    const m = state.hwEditModal
    const hw = state.selectedHomework
    const existingCount = (m.removedPrimary ? 0 : ((hw?.has_local_file || hw?.has_telegram_file) ? 1 : 0))
      + (Array.isArray(hw?.attachments) ? hw.attachments.filter((a) => !m.removedAttachmentIds.includes(a.id)).length : 0)
      + m.newPhotos.length
    const canAdd = Math.max(0, 5 - existingCount)
    const toAdd = files.slice(0, canAdd).map((f) => ({ url: URL.createObjectURL(f), file: f }))
    state.hwEditModal = { ...state.hwEditModal, newPhotos: [...m.newPhotos, ...toAdd] }
    input.value = ''
    render()
  }
  window.__ba_submitHwEdit = async () => {
    const m = state.hwEditModal
    const hw = state.selectedHomework
    if (!hw) return
    state.hwEditModal = { ...m, busy: true, error: '' }
    render()
    try {
      const fd = new FormData()
      fd.append('telegram_id', String(state.appUserId))
      fd.append('haircut_name', document.getElementById('hwe-haircut')?.value?.trim() || '')
      fd.append('text_content', document.getElementById('hwe-text')?.value?.trim() || '')
      if (m.removedPrimary) fd.append('remove_primary', '1')
      if (m.removedAttachmentIds.length) fd.append('remove_attachment_ids', JSON.stringify(m.removedAttachmentIds))
      m.newPhotos.forEach((p) => fd.append('files', p.file))

      const headers = { ...buildHeaders(state.platform) }
      delete headers['Content-Type']

      const r = await fetch(apiUrl(`/api/student/homeworks/${hw.id}`), {
        method: 'PATCH',
        headers,
        body: fd,
      })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка (${r.status})`)

      if (payload?.data?.homework) {
        state.selectedHomework = payload.data.homework
        authImgCache.clear()
      }
      state.hwEditModal.newPhotos.forEach((p) => URL.revokeObjectURL(p.url))
      state.hwEditModal = { open: false, homeworkId: null, busy: false, error: '', removedPrimary: false, removedAttachmentIds: [], newPhotos: [] }
      render()
      toast(root, 'Сохранено')
    } catch (e) {
      state.hwEditModal = { ...state.hwEditModal, busy: false, error: e?.message || 'Не удалось сохранить' }
      render()
    }
  }

  window.__ba_adminProfileEdit = async (editId, action) => {
    try {
      await apiPost(state.platform, `/api/admin/profile-edits/${editId}`, {
        telegram_id: state.appUserId,
        action,
      })
      toast(root, action === 'approve' ? 'Изменения одобрены' : 'Заявка отклонена')
      await loadAdminModeration()
    } catch (e) {
      toast(root, e?.message || 'Ошибка')
    }
  }
  window.__ba_setTab = (t) => {
    setTab(String(t))
    if (state.scr === 'student') {
      if (t === 'notifs') void loadNotifications()
      if (t === 'chat') {
        const sid = state.session?.student?.id
        if (sid) void loadChatMessages(String(sid))
      }
      if (t === 'home' || t === 'works') void loadStudentHomeworks()
    }
    if (state.scr === 'teacher') {
      if (t === 'notifs') void loadNotifications()
      if (t === 'students') void loadTeacherStudents()
      if (t === 'profile' || t === 'review') {
        void loadTeacherDashboard()
        void loadTeacherStudents()
      }
    }
    if (state.scr === 'admin') {
      if (t === 'feedback') void loadAdminFeedback(false)
      if (t === 'notifs') void loadNotifications()
      if (t === 'pending') void loadAdminModeration()
      if (t === 'students') {
        void loadAdminStudents()
        void loadAdminTeachers()
      }
      if (t === 'teachers') void loadAdminTeachers()
    }
  }
  window.__ba_toggleTheme = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* ignore */ }
  }
  window.__ba_saveAbout = async () => {
    const about = document.getElementById('about-me')?.value?.trim() || ''
    try {
      await apiPost(state.platform, '/api/student/about', { telegram_id: state.appUserId, about_me: about })
      if (state.session?.student) state.session.student.about_me = about
      toast(root, 'Сохранено')
    } catch (error) { toast(root, error?.message || 'Не удалось сохранить') }
  }
  window.__ba_saveTeacherAbout = async () => {
    const about = document.getElementById('teacher-about')?.value?.trim() || ''
    try {
      await apiPost(state.platform, '/api/teacher/about', { telegram_id: state.appUserId, about_me: about })
      if (state.session?.teacher) state.session.teacher.about_me = about
      toast(root, 'Сохранено')
    } catch (error) { toast(root, error?.message || 'Не удалось сохранить') }
  }
  window.__ba_go = (scr) => go(String(scr))
  window.__ba_openHw = async (hwId) => {
    const hw = (state.studentHomeworks.items || []).find((x) => Number(x.id) === Number(hwId))
    if (!hw) return
    go('hw-view', { homework: hw })
  }
  window.__ba_submitHw = () => void submitHomework()
  window.__ba_dismissHwSubmit = () => {
    state.hwSubmit = { status: 'idle', error: '' }
    render()
  }
  window.__ba_sendChat = (studentId) => void sendChatMessage(studentId)

  window.__ba_openTeacherStudent = async (studentId, fullName) => {
    state.adminStudentProfile = { status: 'idle', student: null, homeworks: [], error: '' }
    state.selectedStudent = { id: Number(studentId), full_name: fullName }
    go('t-student', { student: state.selectedStudent })
    await loadTeacherStudentHomeworks(studentId)
  }
  window.__ba_teacherOpenChat = (studentId) => {
    const id = Number(studentId)
    const st = state.teacherStudentHomeworks.student
    const name =
      st?.id === id ? st.full_name : state.selectedStudent?.id === id ? state.selectedStudent.full_name : ''
    state.selectedStudent = { id, full_name: name || 'Ученик' }
    go('teacher-chat')
    void loadChatMessages(String(id))
  }
  window.__ba_openTeacherHw = async (hwId) => {
    const hw = (state.teacherStudentHomeworks.items || []).find((x) => Number(x.id) === Number(hwId))
    if (!hw) return
    go('hw-view', { homework: hw })
  }

  window.__ba_adminApprove = (studentId) => {
    const sid = Number(studentId)
    const cbs = document.querySelectorAll(`input.pa-cb-${sid}`)
    const teacher_ids = [...cbs].filter((c) => c.checked).map((c) => Number(c.value))
    void adminSetStudentStatus(sid, 'approve', teacher_ids)
  }
  window.__ba_adminReject = (studentId) => void adminSetStudentStatus(Number(studentId), 'reject')

  window.__ba_adminToggleEdit = (id) => {
    const n = Number(id)
    state.adminEditOpenId = state.adminEditOpenId === n ? null : n
    render()
  }
  window.__ba_adminSaveInline = (studentId) => void submitAdminStudentInline(studentId)
  window.__ba_adminOpenStudent = (studentId) => {
    state.teacherStudentHomeworks = { status: 'idle', student: null, items: [], error: '' }
    go('admin-student')
    void loadAdminStudentProfile(Number(studentId))
  }
  window.__ba_adminChatFromList = (studentId) => {
    const id = Number(studentId)
    const row = state.adminStudents.items.find((x) => Number(x.id) === id)
    state.selectedStudent = { id, full_name: row?.full_name || '' }
    go('admin-chat')
    void loadChatMessages(String(id))
  }
  window.__ba_adminChatFromProfile = (studentId) => {
    const id = Number(studentId)
    const st = state.adminStudentProfile.student
    state.selectedStudent = { id, full_name: st?.full_name || '' }
    go('admin-chat')
    void loadChatMessages(String(id))
  }
  window.__ba_adminProfileOpenHw = (hwId) => {
    const hw = state.adminStudentProfile.homeworks?.find((x) => Number(x.id) === Number(hwId))
    if (!hw) return
    go('hw-view', { homework: hw })
  }

  window.__ba_adminOpenTeacher = (teacherId) => {
    const id = Number(teacherId)
    const t = (state.adminTeachers.items || []).find((x) => Number(x.id) === id)
    if (!t) return
    go('admin-teacher', { adminTeacher: t })
    if (state.adminStudents.status !== 'loaded') void loadAdminStudents()
  }

  window.__ba_hwNewAddPhotos = (inp) => {
    void (async () => {
      const files = [...(inp?.files || [])]
      if (inp) inp.value = ''
      if (!files.length) return
      const cur = [...(state.hwNewDraft?.items || [])]
      const room = 5 - cur.length
      if (room <= 0) {
        toast(root, 'Можно не более 5 фотографий')
        return
      }
      for (const f of files.slice(0, room)) {
        try {
          const file = await compressImageToJpegFile(f)
          const url = URL.createObjectURL(file)
          cur.push({ url, file })
        } catch {
          toast(root, 'Не удалось обработать фото')
        }
      }
      state.hwNewDraft = { items: cur }
      render()
    })()
  }
  window.__ba_hwNewRemovePhoto = (i) => {
    const idx = Number(i)
    const items = [...(state.hwNewDraft?.items || [])]
    if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return
    const it = items[idx]
    if (it?.url) {
      try {
        URL.revokeObjectURL(it.url)
      } catch {
        // ignore
      }
    }
    items.splice(idx, 1)
    state.hwNewDraft = { items }
    render()
  }
  window.__ba_hwNewBonusToggle = () => {
    const cb = document.getElementById('hw-bonus')
    const num = document.getElementById('hw-num')
    if (!cb || !num) return
    if (cb.checked) {
      num.disabled = true
      num.value = ''
      num.placeholder = 'Не требуется (бонус)'
    } else {
      num.disabled = false
      num.placeholder = 'Номер задания (урока)'
    }
  }
  window.__ba_submitHwRevision = (id) => void submitStudentHwRevision(Number(id))
  window.__ba_saveHwGradeInline = (id) => void saveHwGradeInline(Number(id))
  window.__ba_addHomeworkComment = (id) => void addHomeworkComment(Number(id))
  window.__ba_setHwStar = (homeworkId, n) => {
    const starsEl = document.getElementById('hw-stars')
    if (!starsEl) return
    const prev = Number(starsEl.dataset.rating) || 0
    const newRating = prev === n ? 0 : n
    starsEl.dataset.rating = String(newRating)
    for (let i = 1; i <= 5; i++) {
      const s = document.getElementById(`hw-star-${i}`)
      if (s) s.style.color = i <= newRating ? 'var(--gold)' : 'rgba(201,162,39,.2)'
    }
    updateHwSubmitBtn()
  }
  window.__ba_onHwCommentChange = () => updateHwSubmitBtn()
  window.__ba_openHwFromNotif = (notificationId, homeworkId) => void openHwFromNotif(notificationId, homeworkId)

  render()
  void bootstrap()
}

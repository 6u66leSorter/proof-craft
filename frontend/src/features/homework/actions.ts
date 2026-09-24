import type { QueryClient } from '@tanstack/react-query'
import { apiPost, apiUrl } from '../../api/client'
import { multipartHeaders } from '../../api/files'
import { refreshSessionQuiet } from '../../app/session'
import { HW_EDIT_CLOSED, useApp } from '../../app/store'
import { compressImageToJpegFile } from '../../domain/image'
import { clearAuthImages } from '../../ui/AuthImg'
import { toast } from '../../ui/toast'
import { fetchStudentHomeworks } from '../student/api'
import { fetchTeacherStudentHomeworks, teacherStudentHomeworksKey } from '../teacher/api'

const MAX_PHOTOS = 5
const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000
const message = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function postMultipart(path: string, form: FormData, method = 'POST', signal?: AbortSignal) {
  const response = await fetch(apiUrl(path), { method, cache: 'no-store', headers: multipartHeaders(), body: form, signal })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

/** Перечитать работы ученика и обновить открытую работу (legacy: `loadStudentHomeworks` + поиск по id). */
async function refreshStudentHomework(queryClient: QueryClient, homeworkId: number) {
  const appUserId = useApp.getState().appUserId
  const items = await queryClient.fetchQuery({ queryKey: ['student', 'homeworks', appUserId], queryFn: fetchStudentHomeworks, staleTime: 0 })
  const refreshed = items.find((x) => Number(x.id) === Number(homeworkId))
  if (refreshed) useApp.getState().patch({ selectedHomework: refreshed })
}

/** Перечитать работы ученика, открытого у преподавателя; возвращает свежую работу. */
async function refreshTeacherHomework(queryClient: QueryClient, homeworkId: number) {
  const studentId = useApp.getState().teacherStudentId
  if (studentId == null) return null
  const data = await queryClient.fetchQuery({
    queryKey: teacherStudentHomeworksKey(studentId),
    queryFn: () => fetchTeacherStudentHomeworks(studentId),
    staleTime: 0,
  })
  return data.homeworks.find((x) => Number(x.id) === Number(homeworkId)) ?? null
}

// ——— Новое ДЗ ———

export async function addDraftPhotos(files: File[]) {
  if (!files.length) return
  const current = [...useApp.getState().hwNewDraft]
  const room = MAX_PHOTOS - current.length
  if (room <= 0) {
    toast('Можно не более 5 фотографий')
    return
  }
  for (const f of files.slice(0, room)) {
    try {
      const file = await compressImageToJpegFile(f)
      current.push({ url: URL.createObjectURL(file), file })
    } catch {
      toast('Не удалось обработать фото')
    }
  }
  useApp.getState().patch({ hwNewDraft: current })
}

export function removeDraftPhoto(index: number) {
  const items = [...useApp.getState().hwNewDraft]
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return
  URL.revokeObjectURL(items[index].url)
  items.splice(index, 1)
  useApp.getState().patch({ hwNewDraft: items })
}

export type NewHomeworkForm = { isBonus: boolean; lesson: string; title: string; description: string }

let submitInFlight = false

export async function submitHomework(queryClient: QueryClient, form: NewHomeworkForm) {
  const app = useApp.getState()
  if (app.hwSubmit.status !== 'idle' || submitInFlight) return
  const numRaw = form.lesson.trim()
  const title = form.title.trim()
  const desc = form.description.trim()
  const draft = app.hwNewDraft

  // Исправленный дефект legacy: там номер требовался и для бонуса, хотя поле очищено и заблокировано,
  // поэтому бонусное задание отправить было невозможно. API принимает бонус без номера урока.
  if ((!form.isBonus && !numRaw) || !title || !desc) {
    toast('Заполните номер задания, название и описание')
    return
  }
  if (!form.isBonus) {
    const lessonNum = Number(numRaw)
    if (!Number.isInteger(lessonNum) || lessonNum <= 0) {
      toast('Номер задания — целое число больше нуля')
      return
    }
    const maxLessons = app.session?.student?.lessons_count
    if (maxLessons != null && lessonNum > maxLessons) {
      toast(`Урок №${lessonNum} недоступен. По вашей программе ${maxLessons} уроков.`)
      return
    }
  }
  if (!draft.length) {
    toast('Добавьте хотя бы одно фото работы')
    return
  }
  if (draft.length > MAX_PHOTOS) {
    toast('Можно не более 5 фотографий')
    return
  }

  const body = new FormData()
  body.append('telegram_id', String(app.appUserId))
  body.append('is_bonus', form.isBonus ? '1' : '0')
  if (!form.isBonus) body.append('lesson_number', String(Number(numRaw)))
  body.append('haircut_name', title)
  body.append('text_content', desc)
  for (const item of draft) body.append('file', item.file, item.file.name || 'photo.jpg')

  submitInFlight = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  app.patch({ hwSubmit: { status: 'loading', error: '' }, hwSubmitAbort: () => controller.abort() })
  try {
    const { response, payload } = await postMultipart('/api/homeworks', body, 'POST', controller.signal)
    if (response.status === 413) throw new Error(payload?.error || 'Файл слишком большой.')
    if (response.status === 409) throw new Error(payload?.error || 'Эта работа уже отправлена на проверку.')
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка запроса (${response.status}).`)
    useApp.getState().patch({ hwSubmitAbort: null, hwSubmit: { status: 'success', error: '' }, hwNewDraft: [] })
    await sleep(1400)
    useApp.getState().patch({ hwSubmit: { status: 'idle', error: '' } })
    useApp.getState().back()
    await queryClient.invalidateQueries({ queryKey: ['student', 'homeworks'] })
    await refreshSessionQuiet()
  } catch (error) {
    useApp.getState().patch({ hwSubmitAbort: null })
    if (error instanceof DOMException && error.name === 'AbortError') {
      useApp.getState().patch({ hwSubmit: { status: 'idle', error: '' } })
      return
    }
    useApp.getState().patch({ hwSubmit: { status: 'error', error: message(error, 'Не удалось отправить') } })
  } finally {
    clearTimeout(timeout)
    submitInFlight = false
  }
}

export const dismissHomeworkSubmit = () => useApp.getState().patch({ hwSubmit: { status: 'idle', error: '' } })

// ——— Просмотр ДЗ ———

export async function addHomeworkComment(queryClient: QueryClient, homeworkId: number, text: string) {
  const content = text.trim()
  if (!content) {
    toast('Напишите комментарий')
    return false
  }
  const { platform, appUserId, session } = useApp.getState()
  try {
    await apiPost(platform, `/api/homeworks/${encodeURIComponent(homeworkId)}/comments`, { telegram_id: appUserId, text_content: content })
    if (useApp.getState().teacherStudentId != null) {
      const refreshed = await refreshTeacherHomework(queryClient, homeworkId)
      if (refreshed) useApp.getState().patch({ selectedHomework: refreshed })
    } else if (session?.student?.id) {
      await refreshStudentHomework(queryClient, homeworkId)
    }
    toast('Комментарий отправлен')
    return true
  } catch (error) {
    toast(message(error, 'Не удалось отправить комментарий'))
    return false
  }
}

export async function submitHomeworkRevision(queryClient: QueryClient, homeworkId: number, text: string, file: File | null) {
  const content = text.trim()
  if (!content) {
    toast('Опишите исправление')
    return
  }
  const body = new FormData()
  body.append('telegram_id', String(useApp.getState().appUserId))
  body.append('revision_text', content)
  if (file) body.append('file', file, file.name)
  try {
    const { response, payload } = await postMultipart(`/api/student/homeworks/${encodeURIComponent(homeworkId)}/revision`, body)
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка запроса (${response.status}).`)
    toast('Исправление отправлено')
    await refreshStudentHomework(queryClient, homeworkId)
    await refreshSessionQuiet()
  } catch (error) {
    toast(message(error, 'Не удалось отправить'))
  }
}

export async function saveHomeworkReview(queryClient: QueryClient, homeworkId: number, rating: number, comment: string) {
  const text = comment.trim() || null
  const grade = rating || null
  if (!grade && !text) {
    toast('Укажите оценку или напишите комментарий')
    return
  }
  const { platform, appUserId, session } = useApp.getState()
  try {
    await apiPost(platform, '/api/teacher/review', {
      telegram_id: appUserId,
      homework_id: homeworkId,
      rating: grade ?? undefined,
      comment: text ?? undefined,
    })
    toast(grade ? 'Задание принято' : 'Комментарий сохранён')
    // Legacy перечитывает список работ ученика у преподавателя, но открытую работу не обновляет (перенесено 1 в 1).
    await refreshTeacherHomework(queryClient, homeworkId)
    if (session?.student?.id) await refreshStudentHomework(queryClient, homeworkId)
    await refreshSessionQuiet()
  } catch (error) {
    toast(message(error, 'Ошибка'))
  }
}

// ——— Редактирование ДЗ на проверке ———

const patchEdit = (patch: Partial<ReturnType<typeof useApp.getState>['hwEdit']>) =>
  useApp.getState().patch({ hwEdit: { ...useApp.getState().hwEdit, ...patch } })

export const openHomeworkEdit = () => useApp.getState().patch({ hwEdit: { ...HW_EDIT_CLOSED, open: true } })

export function closeHomeworkEdit() {
  useApp.getState().hwEdit.newPhotos.forEach((p) => URL.revokeObjectURL(p.url))
  useApp.getState().patch({ hwEdit: HW_EDIT_CLOSED })
}

export const removeEditPrimary = () => patchEdit({ removedPrimary: true })
export const removeEditAttachment = (id: number) =>
  patchEdit({ removedAttachmentIds: [...useApp.getState().hwEdit.removedAttachmentIds, id] })

export function removeEditNewPhoto(index: number) {
  const photos = [...useApp.getState().hwEdit.newPhotos]
  if (photos[index]) URL.revokeObjectURL(photos[index].url)
  photos.splice(index, 1)
  patchEdit({ newPhotos: photos })
}

/** Добавить фото без сжатия, не больше 5 вместе с оставшимися на сервере и уже добавленными (legacy `__ba_hwEditAddPhotos`). */
export function addEditPhotos(files: File[], existingCount: number) {
  const photos = useApp.getState().hwEdit.newPhotos
  const room = Math.max(0, MAX_PHOTOS - existingCount - photos.length)
  const added = files.slice(0, room).map((file) => ({ url: URL.createObjectURL(file), file }))
  patchEdit({ newPhotos: [...photos, ...added] })
}

export async function submitHomeworkEdit(homeworkId: number, haircut: string, text: string) {
  const m = useApp.getState().hwEdit
  patchEdit({ busy: true, error: '' })
  try {
    const body = new FormData()
    body.append('telegram_id', String(useApp.getState().appUserId))
    body.append('haircut_name', haircut.trim())
    body.append('text_content', text.trim())
    if (m.removedPrimary) body.append('remove_primary', '1')
    if (m.removedAttachmentIds.length) body.append('remove_attachment_ids', JSON.stringify(m.removedAttachmentIds))
    m.newPhotos.forEach((p) => body.append('files', p.file))
    const { response, payload } = await postMultipart(`/api/student/homeworks/${homeworkId}`, body, 'PATCH')
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка (${response.status})`)
    if (payload?.data?.homework) {
      clearAuthImages()
      useApp.getState().patch({ selectedHomework: payload.data.homework, imageEpoch: useApp.getState().imageEpoch + 1 })
    }
    closeHomeworkEdit()
    toast('Сохранено')
  } catch (error) {
    patchEdit({ busy: false, error: message(error, 'Не удалось сохранить') })
  }
}

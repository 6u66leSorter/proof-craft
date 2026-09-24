import { useApp } from '../app/store'
import { apiUrl, buildHeaders } from './client'

const enc = encodeURIComponent

export const guestHomeworkFileUrl = (homeworkId: number, preview = false) =>
  apiUrl(`/api/guest/homeworks/${enc(homeworkId)}/file${preview ? '?preview=1' : ''}`)

export const guestHomeworkAttachmentFileUrl = (homeworkId: number, attachmentId: number, preview = false) =>
  apiUrl(`/api/guest/homeworks/${enc(homeworkId)}/attachments/${enc(attachmentId)}/file${preview ? '?preview=1' : ''}`)

export const guestStudentAvatarUrl = (studentId: number) => apiUrl(`/api/guest/students/${enc(studentId)}/avatar`)

/** Скачивает файл с заголовками авторизации и открывает его во вкладке (legacy `__ba_openFile`). */
export async function openFile(url: string, onError: (message: string) => void) {
  try {
    const response = await fetch(url, { headers: buildHeaders(useApp.getState().platform) })
    if (!response.ok) {
      onError('Не удалось открыть файл')
      return
    }
    const blobUrl = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = blobUrl
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  } catch {
    onError('Не удалось открыть файл')
  }
}

const withUser = (preview = false) => {
  const q = new URLSearchParams({ telegram_id: String(useApp.getState().appUserId) })
  if (preview) q.set('preview', '1')
  return q.toString()
}

export const homeworkFileUrl = (homeworkId: number, preview = false) =>
  apiUrl(`/api/homeworks/${enc(homeworkId)}/file?${withUser(preview)}`)

export const homeworkRevisionFileUrl = (homeworkId: number, preview = false) =>
  apiUrl(`/api/homeworks/${enc(homeworkId)}/revision/file?${withUser(preview)}`)

export const homeworkAttachmentFileUrl = (homeworkId: number, attachmentId: number, preview = false) =>
  apiUrl(`/api/homeworks/${enc(homeworkId)}/attachments/${enc(attachmentId)}/file?${withUser(preview)}`)

export const ownAvatarUrl = () => apiUrl(`/api/student/me/avatar?${withUser()}`)

export const studentAvatarUrl = (studentId: number) => apiUrl(`/api/students/${enc(studentId)}/avatar?${withUser()}`)

export const chatFileUrl = (messageId: number) => apiUrl(`/api/chats/messages/${enc(messageId)}/file?${withUser()}`)

/** Заголовки для multipart: браузер сам выставит Content-Type с boundary. */
export const multipartHeaders = () => {
  const headers = buildHeaders(useApp.getState().platform)
  delete headers['Content-Type']
  return headers
}

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

export type HomeworkFile = {
  id: number
  content_type: 'photo' | 'video' | 'text' | 'document'
  has_local_file?: boolean
  has_telegram_file?: boolean
}

export type HomeworkBase = {
  id: number
  lesson_number: number | null
  is_bonus: boolean | number
  haircut_name: string | null
  content_type: 'photo' | 'video' | 'text' | 'document'
  text_content: string | null
  status: 'pending' | 'approved' | 'rejected' | 'revision'
  rating: number | null
  review_comment?: string | null
  reviewer_name?: string | null
  has_local_file?: boolean
  has_telegram_file?: boolean
  attachments?: HomeworkFile[]
}

export type PhotoItem = { preview: string; full: string }

type PrimaryUrl = (homeworkId: number, preview: boolean) => string
type AttachmentUrl = (homeworkId: number, attachmentId: number, preview: boolean) => string

export const homeworkTitle = (hw: HomeworkBase) =>
  hw.haircut_name || (hw.is_bonus ? 'Бонус' : `Урок #${hw.lesson_number ?? '—'}`)

export const contentTypeRu = (type: string) =>
  ({ photo: 'Фотография', video: 'Видео', document: 'Документ', text: 'Описание' })[type] || 'Работа'

const hasFile = (file: { has_local_file?: boolean; has_telegram_file?: boolean }) =>
  Boolean(file.has_local_file || file.has_telegram_file)

/** Фотографии работы: сжатое превью для ленты и оригинал для открытия по тапу. */
export function homeworkPhotoItems(hw: HomeworkBase, primaryUrl: PrimaryUrl, attachmentUrl: AttachmentUrl): PhotoItem[] {
  const items: PhotoItem[] = []
  if (hw.content_type === 'photo' && hasFile(hw)) items.push({ preview: primaryUrl(hw.id, true), full: primaryUrl(hw.id, false) })
  for (const a of hw.attachments ?? []) {
    if (a.content_type === 'photo' && hasFile(a)) {
      items.push({ preview: attachmentUrl(hw.id, a.id, true), full: attachmentUrl(hw.id, a.id, false) })
    }
  }
  return items
}

const primaryFileLabel = (type: string) =>
  type === 'video' ? 'Открыть видео' : type === 'document' ? 'Открыть документ' : 'Открыть фото'

const attachmentFileLabel = (type: string, n: number) =>
  type === 'video' ? `Видео ${n}` : type === 'document' ? `Документ ${n}` : `Фото ${n}`

export type MediaButton = { key: string; label: string; url: string; primary: boolean }

/** При skipPhotos остаются только файлы, которых нет в ленте: видео и документы. */
export function homeworkMediaButtons(
  hw: HomeworkBase,
  primaryUrl: (homeworkId: number) => string,
  attachmentUrl: (homeworkId: number, attachmentId: number) => string,
  { skipPhotos = false } = {},
): MediaButton[] {
  const buttons: MediaButton[] = []
  let n = 1
  if (hasFile(hw) && !(skipPhotos && hw.content_type === 'photo')) {
    buttons.push({ key: 'primary', label: primaryFileLabel(hw.content_type), url: primaryUrl(hw.id), primary: true })
  }
  n += 1
  for (const a of hw.attachments ?? []) {
    if (hasFile(a) && !(skipPhotos && a.content_type === 'photo')) {
      buttons.push({ key: `a${a.id}`, label: attachmentFileLabel(a.content_type, n), url: attachmentUrl(hw.id, a.id), primary: false })
    }
    n += 1
  }
  return buttons
}

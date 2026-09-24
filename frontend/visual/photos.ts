import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Детерминированные фото для загрузки в формах: заранее сгенерированные JPEG из каталога сида. */
const SOURCES = ['hw-fade.jpg', 'hw-crop.jpg', 'hw-beard.jpg', 'hw-revision.jpg', 'hw-max-fade.jpg', 'hw-egor.jpg']

export function photoFiles(count: number) {
  return SOURCES.slice(0, count).map((name) => ({
    name,
    mimeType: 'image/jpeg',
    buffer: readFileSync(join(import.meta.dirname, 'fixtures', name)),
  }))
}

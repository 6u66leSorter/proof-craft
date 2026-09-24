import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { buildHeaders } from '../api/client'
import { useApp } from '../app/store'

const FALLBACK = '/academy-role-logo.jpg'
/** Кэш на время жизни страницы: один запрос на URL. */
const cache = new Map<string, Promise<string>>()

function loadBlobUrl(src: string): Promise<string> {
  let pending = cache.get(src)
  if (!pending) {
    pending = fetch(src, { headers: buildHeaders(useApp.getState().platform) })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
      .then((blob) => URL.createObjectURL(blob))
    pending.catch(() => cache.delete(src))
    cache.set(src, pending)
  }
  return pending
}

/** Забыть закэшированную картинку (например, после замены аватара). */
export const forgetAuthImage = (src: string) => cache.delete(src)

/** Забыть все картинки. */
export const clearAuthImages = () => cache.clear()

type AuthImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }

/**
 * Картинка из API с заголовками авторизации.
 * Атрибут `data-auth-src` сохранён: по нему визуальные тесты ждут загрузку.
 * При ошибке показывается логотип академии.
 */
export function AuthImg({ src, alt, ...rest }: AuthImgProps) {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const epoch = useApp((s) => s.imageEpoch)
  useEffect(() => {
    let active = true
    loadBlobUrl(src).then(
      (blobUrl) => active && setUrl(blobUrl),
      () => active && setUrl(FALLBACK),
    )
    return () => {
      active = false
    }
  }, [src, epoch])
  return (
    <img
      {...rest}
      data-auth-src={src}
      src={url}
      alt={alt}
      onError={(event) => {
        if (!event.currentTarget.src.endsWith(FALLBACK)) event.currentTarget.src = FALLBACK
      }}
    />
  )
}

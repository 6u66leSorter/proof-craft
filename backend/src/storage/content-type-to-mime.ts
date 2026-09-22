export const contentTypeToMime = (contentType: string): string => {
  if (contentType === 'photo') return 'image/jpeg'
  if (contentType === 'video') return 'video/mp4'
  if (contentType === 'document') return 'application/octet-stream'
  return 'text/plain; charset=utf-8'
}

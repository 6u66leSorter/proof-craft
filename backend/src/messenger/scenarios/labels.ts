/** Подписи людей в кнопках и списках. */
export const personLabel = (name: string, username: string | null | undefined, id: number): string => {
  const meta = [username ? `@${username}` : null, `id ${id}`].filter(Boolean).join(' · ')
  return `${name}${meta ? ` (${meta})` : ''}`
}

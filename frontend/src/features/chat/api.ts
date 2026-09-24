import { useQuery } from '@tanstack/react-query'
import { apiGet, apiUrl } from '../../api/client'
import { multipartHeaders } from '../../api/files'
import { useApp } from '../../app/store'

export type ChatMessage = {
  id: number
  sender_user_id: number
  sender_name: string | null
  sender_role: string | null
  sender_role_color: string | null
  text_content: string | null
  has_file: boolean
  created_at: string
}

export const chatQueryKey = (studentId: string) => ['chat', studentId]

export function useChatMessages(studentId: string | null) {
  const platform = useApp((s) => s.platform)
  const appUserId = useApp((s) => s.appUserId)
  return useQuery({
    queryKey: chatQueryKey(String(studentId)),
    enabled: studentId != null,
    refetchOnMount: 'always',
    queryFn: async () =>
      (
        await apiGet<{ messages?: ChatMessage[] }>(
          platform,
          `/api/chats/messages?telegram_id=${encodeURIComponent(String(appUserId))}&student_id=${encodeURIComponent(String(studentId))}&limit=200`,
        )
      ).messages ?? [],
  })
}

/** Отправка текста в чат ученика; multipart, как в legacy. */
export async function sendChatMessage(studentId: string, text: string) {
  const form = new FormData()
  form.append('telegram_id', String(useApp.getState().appUserId))
  form.append('student_id', studentId)
  form.append('text_content', text)
  const response = await fetch(apiUrl('/api/chats/messages'), { method: 'POST', cache: 'no-store', headers: multipartHeaders(), body: form })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Ошибка запроса (${response.status}).`)
}

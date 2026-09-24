import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { chatFileUrl, openFile } from '../../api/files'
import { refreshSessionQuiet } from '../../app/session'
import { useApp } from '../../app/store'
import { iconButtonLabel } from '../../ui/a11y'
import { ICO } from '../../ui/icons'
import { toast } from '../../ui/toast'
import { chatQueryKey, sendChatMessage, useChatMessages, type ChatMessage } from './api'

function Message({ m, ownUserId }: { m: ChatMessage; ownUserId: number }) {
  // Legacy сравнивает с session.user_id, которого нет в ответе API, — все сообщения слева (перенесено 1 в 1).
  const mine = Number(m.sender_user_id) === ownUserId
  return (
    <div style={{ marginBottom: 8, textAlign: mine ? 'right' : 'left' }}>
      <div className={mine ? 'msg-bubble msg-mine' : 'msg-bubble msg-other'}>
        <div style={{ fontSize: 12, fontWeight: 700, color: m.sender_role_color || 'var(--dim)', fontFamily: 'var(--font-body)', marginBottom: 1 }}>
          {`${m.sender_name || ''}${m.sender_role ? ' ' : ''}`}
          {m.sender_role && <span style={{ fontWeight: 400, color: 'var(--dim)' }}>{`(${m.sender_role})`}</span>}
        </div>
        {m.text_content && <div>{m.text_content}</div>}
        {m.has_file && (
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => void openFile(chatFileUrl(m.id), toast)}
              style={{ color: 'var(--gold)', fontFamily: 'var(--font-body)', fontSize: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Файл
            </button>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', marginTop: 4 }}>{m.created_at}</div>
      </div>
    </div>
  )
}

/** Лента чата ученика с командой и поле ввода (legacy `renderChatScreen`). */
export function ChatPanel() {
  const session = useApp((s) => s.session)
  const selectedStudent = useApp((s) => s.selectedStudent) as { id?: number } | null
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const isTeacherOrAdmin = Boolean(session?.isTeacher || session?.isAdmin)
  const threadId = isTeacherOrAdmin
    ? selectedStudent?.id != null
      ? String(selectedStudent.id)
      : null
    : session?.student?.id != null
      ? String(session.student.id)
      : null
  const query = useChatMessages(threadId)
  const messages = query.data ?? []

  const send = async () => {
    const text = draft.trim()
    if (!text || !threadId) return
    setDraft('')
    try {
      await sendChatMessage(threadId, text)
      await queryClient.invalidateQueries({ queryKey: chatQueryKey(threadId) })
      await refreshSessionQuiet()
    } catch (error) {
      toast((error instanceof Error && error.message) || 'Не удалось отправить')
    }
  }

  let body
  if (!threadId && isTeacherOrAdmin) body = <p className="empty">Откройте чат из профиля ученика — кнопка «Чат с учеником».</p>
  else if (!threadId) body = <p className="empty">Не удалось определить чат.</p>
  else if (messages.length) body = messages.map((m) => <Message key={m.id} m={m} ownUserId={Number(session?.user_id || 0)} />)
  else body = <p className="empty">Сообщений нет</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="scr" style={{ padding: 0 }}>
        <div id="chat-scroll" style={{ padding: 12 }}>
          {body}
        </div>
      </div>
      {threadId && (
        <div className="chat-input-row">
          <input
            className="inp"
            id="chat-input"
            placeholder="Сообщение..."
            aria-label="Сообщение..."
            style={{ flex: 1 }}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void send()
            }}
          />
          <button className="btn bf bs" onClick={() => void send()} style={{ padding: '8px 10px' }} {...iconButtonLabel('Открыть чат')}>
            {ICO.send}
          </button>
        </div>
      )}
    </div>
  )
}

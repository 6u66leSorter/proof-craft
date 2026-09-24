import { useApp } from '../../app/store'
import { Header } from '../../ui/Header'
import { ChatPanel } from './ChatPanel'

/** Чат преподавателя или администратора с учеником. */
export function StaffChatScreen() {
  const name = useApp((s) => (s.selectedStudent as { full_name?: string } | null)?.full_name?.trim())
  return (
    <>
      <Header title={name ? `Чат · ${name}` : 'Чат'} onBack={() => useApp.getState().back()} />
      <div className="scr fi" style={{ padding: 0 }}>
        <ChatPanel />
      </div>
    </>
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { useApp } from '../../app/store'
import { cardButtonProps } from '../../ui/a11y'
import { useNotifications, type AppNotification } from './api'
import { openHwFromNotif } from './openHwFromNotif'

const positiveInt = (value: unknown) => {
  const n = value != null ? Number(value) : NaN
  return Number.isInteger(n) && n > 0 ? n : 0
}

function NotificationCard({ n }: { n: AppNotification }) {
  const session = useApp((s) => s.session)
  const queryClient = useQueryClient()
  const payload = n.payload && typeof n.payload === 'object' ? n.payload : {}
  const hwId = positiveInt(payload.homework_id)
  const studentId = positiveInt(payload.student_id)
  const isStudent = Boolean(session?.student)
  const clickable = Boolean(hwId) && (isStudent || (Boolean(session?.isTeacher) && Boolean(studentId)) || (Boolean(session?.isAdmin) && Boolean(studentId)))
  const onClick =
    n.kind === 'feedback_invite' && isStudent
      ? () => useApp.getState().go('feedback')
      : clickable
        ? () => void openHwFromNotif(queryClient, n, hwId, studentId)
        : null
  const unread = !n.read_at
  return (
    <div
      className="card"
      style={{
        marginBottom: 8,
        ...(clickable ? { cursor: 'pointer' } : {}),
        ...(unread ? { borderLeft: '3px solid var(--gold)', boxShadow: '0 0 14px rgba(201,162,39,.12)' } : {}),
      }}
      {...(onClick ? cardButtonProps(onClick) : {})}
    >
      <p style={{ fontSize: 12, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{n.body}</p>
      {clickable && (
        <p style={{ fontSize: 12, color: 'var(--gold)', fontFamily: 'var(--font-body)', marginTop: 3 }}>Нажмите чтобы открыть →</p>
      )}
      <p style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', marginTop: 3 }}>{n.created_at}</p>
    </div>
  )
}

/** Лента уведомлений. До загрузки показывает «Нет уведомлений». */
export function NotificationsList() {
  const query = useNotifications()
  const items = query.data ?? []
  if (!items.length) return <p className="empty">Нет уведомлений</p>
  return (
    <div style={{ padding: 12 }}>
      {items.map((n) => (
        <NotificationCard key={n.id} n={n} />
      ))}
    </div>
  )
}

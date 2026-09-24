import { logout } from '../../app/bootstrap'
import { useApp } from '../../app/store'
import { initialsFromName, text } from '../../domain/format'
import { cardButtonProps, iconButtonLabel } from '../../ui/a11y'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { TabBar } from '../../ui/TabBar'
import { NotificationsList } from '../notifications/NotificationsList'
import { useAdminFeedback, useAdminModeration, useAdminTeachers } from './api'
import { PendingTab } from './PendingTab'
import { StudentsTab } from './StudentsTab'

const logoutButton = (
  <button className="hdr-btn" style={{ color: 'var(--dim)' }} onClick={logout} {...iconButtonLabel('Выйти')}>
    {ICO.logout}
  </button>
)

const feedbackSubject = (subject: string) =>
  ({ teacher: 'О преподавателе', academy: 'Об академии', other: 'Другой вопрос' })[subject] || 'Об обучении'

function FeedbackTab() {
  const query = useAdminFeedback()
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const busy = query.isFetching
  return (
    <>
      <Header title="Обратная связь" />
      <div className="scr" style={{ padding: 14 }}>
        <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 14 }}>
          Конфиденциальные отзывы. Доступны только администраторам академии.
        </p>
        {items.map((item) => (
          <article key={item.id} className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>{item.full_name}</h3>
            <div style={{ fontSize: 12, color: 'var(--gold)' }}>{`${feedbackSubject(item.subject)} · ${item.created_at}`}</div>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>{item.message}</p>
          </article>
        ))}
        {busy && <p className="empty">Загрузка…</p>}
        {query.isError && (
          <>
            <p role="alert">{query.error.message || 'Не удалось загрузить отзывы.'}</p>
            <button className="btn bs" onClick={() => void query.refetch()}>
              Повторить
            </button>
          </>
        )}
        {!busy && !query.isError && !items.length && <p className="empty">Пока нет отзывов. Здесь появятся сообщения учеников.</p>}
        {query.hasNextPage && !busy && (
          <button className="btn bs btn-w" onClick={() => void query.fetchNextPage()}>
            Показать ещё
          </button>
        )}
      </div>
    </>
  )
}

function TeachersTab() {
  const query = useAdminTeachers()
  const items = query.data ?? []
  return (
    <>
      <Header title="Преподаватели" right={logoutButton} />
      <div className="scr" style={{ padding: 12 }}>
        {query.isPending && <p className="empty">Загрузка…</p>}
        {query.isError && <p className="empty">{query.error.message || 'Ошибка'}</p>}
        {items.length
          ? items.map((t) => (
              <div
                key={t.id}
                className="card"
                style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                {...cardButtonProps(() => useApp.getState().go('admin-teacher', { adminTeacher: t }))}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'rgba(201,162,39,.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    color: 'var(--gold)',
                    flexShrink: 0,
                  }}
                >
                  {initialsFromName(t.full_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12 }}>{t.full_name}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>{`учеников: ${text(t.students_count)}`}</div>
                </div>
                <div style={{ color: 'var(--dim)', fontSize: 22, lineHeight: 1, flexShrink: 0, fontWeight: 300 }}>›</div>
              </div>
            ))
          : query.isSuccess && <p className="empty">Нет преподавателей</p>}
      </div>
    </>
  )
}

function NotificationsTab() {
  return (
    <>
      <Header title="Уведомления" right={logoutButton} />
      <div className="scr">
        <NotificationsList />
      </div>
    </>
  )
}

const TABS = ['pending', 'feedback', 'students', 'teachers', 'notifs'] as const

/** Кабинет администратора (legacy `renderAdmin`). */
export function AdminScreen() {
  const tab = useApp((s) => (TABS.includes(s.tab as (typeof TABS)[number]) ? s.tab : 'pending')) as (typeof TABS)[number]
  const unread = useApp((s) => Number(s.session?.unread_notifications_count || 0))
  const moderation = useAdminModeration()
  const pendingCount = (moderation.data?.students.length ?? 0) + (moderation.data?.applications.length ?? 0) + (moderation.data?.edits.length ?? 0)
  return (
    <>
      {tab === 'pending' && (
        <>
          <Header title="Заявки" right={logoutButton} />
          <PendingTab />
        </>
      )}
      {tab === 'feedback' && <FeedbackTab />}
      {tab === 'students' && <StudentsTab />}
      {tab === 'teachers' && <TeachersTab />}
      {tab === 'notifs' && <NotificationsTab />}
      <TabBar
        active={tab}
        onSelect={(key) => useApp.getState().setTab(key)}
        tabs={[
          { key: 'pending', icon: ICO.inbox, label: 'Заявки', count: pendingCount },
          { key: 'feedback', icon: ICO.chat, label: 'Отзывы' },
          { key: 'students', icon: ICO.users, label: 'Ученики' },
          { key: 'teachers', icon: ICO.book, label: 'Преп.' },
          { key: 'notifs', icon: ICO.bell, label: 'Увед.', count: unread },
        ]}
      />
    </>
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { text } from '../../domain/format'
import { ICO } from '../../ui/icons'
import { VkLinkTelegramCard } from '../account/VkLinkTelegramCard'
import { reviewProfileEdit, reviewTeacherApplication, setStudentStatus } from './actions'
import { useAdminModeration, type AdminStudent, type AdminTeacher, type ProfileEdit, type TeacherApplication } from './api'
import { TeacherCheckbox } from './TeacherCheckbox'

const line = (marginBottom: number) => ({ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--dim)', marginBottom }) as const
const nameStyle = { fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, marginBottom: 6 } as const
const sectionTitle = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--gold)',
  marginBottom: 8,
  fontFamily: 'var(--font-body)',
  textTransform: 'uppercase',
  letterSpacing: '.5px',
} as const
const blueCard = { marginBottom: 10, borderColor: 'rgba(100,149,237,.35)' }

function Decision({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button className="btn bg-btn bs" style={{ flex: 1 }} onClick={onApprove}>
        Одобрить
      </button>
      <button className="btn bd bs" style={{ flex: 1 }} onClick={onReject}>
        Отклонить
      </button>
    </div>
  )
}

function ModerationCard({ s, teachers }: { s: AdminStudent; teachers: AdminTeacher[] }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<number[]>([])
  return (
    <div className="card pending-card" style={{ marginBottom: 10 }}>
      <div style={nameStyle}>{s.full_name}</div>
      <div style={line(4)}>{`Тел.: ${s.phone || '—'}`}</div>
      <div style={line(10)}>{`Telegram ID ${text(s.telegram_id)}`}</div>
      {teachers.length ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ ...line(6), textTransform: 'uppercase', letterSpacing: '.5px' }}>Назначить преподавателей</div>
          <div className="tcb-wrap">
            {teachers.map((t) => (
              <TeacherCheckbox
                key={t.id}
                teacher={t}
                className={`pa-cb-${s.id}`}
                checked={selected.includes(t.id)}
                onChange={(on) => setSelected((ids) => (on ? [...ids, t.id] : ids.filter((id) => id !== t.id)))}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="empty" style={{ padding: '4px 0', fontSize: 12 }}>
          Нет одобренных преподавателей — назначьте позже в списке учеников.
        </p>
      )}
      <Decision
        onApprove={() => void setStudentStatus(queryClient, s.id, 'approve', teachers.map((t) => t.id).filter((id) => selected.includes(id)))}
        onReject={() => void setStudentStatus(queryClient, s.id, 'reject')}
      />
    </div>
  )
}

function ApplicationCard({ a }: { a: TeacherApplication }) {
  const queryClient = useQueryClient()
  return (
    <div className="card pending-card" style={blueCard}>
      <div style={nameStyle}>{a.full_name}</div>
      <div style={line(4)}>{`Тел.: ${a.phone || '—'}`}</div>
      <div style={line(10)}>{`ID ${text(a.telegram_id)}`}</div>
      <Decision
        onApprove={() => void reviewTeacherApplication(queryClient, a.id, 'approve')}
        onReject={() => void reviewTeacherApplication(queryClient, a.id, 'reject')}
      />
    </div>
  )
}

function Change({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <>
      {`${label}: `}
      <b>{from}</b>
      {' → '}
      <b>{to}</b>
    </>
  )
}

function ProfileEditCard({ e }: { e: ProfileEdit }) {
  const queryClient = useQueryClient()
  const oldMetro = e.current_metro || '—'
  const newMetro = e.new_metro || '—'
  const changes = [
    e.new_full_name !== e.current_full_name && <Change key="n" label="Имя" from={e.current_full_name} to={e.new_full_name} />,
    e.new_phone !== e.current_phone && <Change key="p" label="Тел." from={e.current_phone} to={e.new_phone} />,
    newMetro !== oldMetro && <Change key="m" label="Метро" from={oldMetro} to={newMetro} />,
  ].filter(Boolean)
  return (
    <div className="card pending-card" style={blueCard}>
      <div style={nameStyle}>{e.current_full_name}</div>
      <div style={line(8)}>{`Telegram ID ${String(e.telegram_id)}`}</div>
      {changes.length ? (
        <div style={{ fontSize: 12, fontFamily: 'var(--font-body)', lineHeight: 1.8, marginBottom: 10 }}>
          {changes.flatMap((c, i) => (i ? [<br key={`br${i}`} />, c] : [c]))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', marginBottom: 10 }}>Нет изменений</div>
      )}
      <Decision
        onApprove={() => void reviewProfileEdit(queryClient, e.id, 'approve')}
        onReject={() => void reviewProfileEdit(queryClient, e.id, 'reject')}
      />
    </div>
  )
}

/** Все заявки на одном экране (legacy вкладка `pending`). */
export function PendingTab() {
  const query = useAdminModeration()
  const data = query.data
  const students = data?.students ?? []
  const applications = data?.applications ?? []
  const edits = data?.edits ?? []
  const total = students.length + applications.length + edits.length
  const allEmpty = query.isSuccess && !total
  let head
  if (query.isPending) head = <p className="empty">Загрузка…</p>
  else if (query.isError) head = <p className="empty">{query.error.message || 'Ошибка'}</p>
  else if (allEmpty)
    head = (
      <div className="empty">
        <div style={{ marginBottom: 8 }}>{ICO.check}</div>
        Все заявки обработаны
      </div>
    )
  else
    head = (
      <p style={{ color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        {`Ожидают · ${total}`}
      </p>
    )
  return (
    <div className="scr" style={{ padding: 12 }}>
      <VkLinkTelegramCard />
      {head}
      {query.isSuccess && !allEmpty && (
        <>
          <div style={sectionTitle}>Ученики</div>
          {students.length ? (
            students.map((s) => <ModerationCard key={s.id} s={s} teachers={data!.teachers} />)
          ) : (
            <p className="empty" style={{ marginBottom: 14 }}>
              Нет заявок учеников
            </p>
          )}
          <div style={{ height: 8 }} />
          <div style={sectionTitle}>Преподаватели</div>
          {applications.length ? applications.map((a) => <ApplicationCard key={a.id} a={a} />) : <p className="empty">Нет заявок преподавателей</p>}
          <div style={{ height: 8 }} />
          <div style={sectionTitle}>Изменения профиля</div>
          {edits.length ? edits.map((e) => <ProfileEditCard key={e.id} e={e} />) : <p className="empty">Нет заявок на изменение профиля</p>}
        </>
      )}
    </div>
  )
}

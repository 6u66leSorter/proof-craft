import { useApp } from '../../app/store'
import { initialsFromName, studentStatusRu, text } from '../../domain/format'
import { cardButtonProps } from '../../ui/a11y'
import { Badge } from '../../ui/Badge'
import { Header } from '../../ui/Header'
import { StudentAvatarImg } from '../../ui/StudentAvatar'
import { openAdminStudent } from './actions'
import { useAdminStudents, type AdminTeacher } from './api'

const back = () => useApp.getState().back()

/** Карточка преподавателя с его учениками (legacy `renderAdminTeacherDetail`). */
export function AdminTeacherScreen() {
  const teacher = useApp((s) => s.selectedAdminTeacher) as AdminTeacher | null
  // Legacy загружает учеников, только если их ещё нет.
  const students = useAdminStudents({ refetchOnMount: false })
  if (!teacher) {
    return (
      <>
        <Header title="Преподаватель" onBack={back} />
        <div className="scr fi" style={{ padding: 14 }}>
          <p className="empty">Не выбран</p>
        </div>
      </>
    )
  }
  const mine = (students.data ?? []).filter((s) => (s.teacher_ids || []).includes(teacher.id))
  return (
    <>
      <Header title={teacher.full_name} onBack={back} />
      <div className="scr fi" style={{ padding: 14 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'rgba(201,162,39,.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px',
              fontWeight: 800,
              fontSize: 18,
              color: 'var(--gold)',
            }}
          >
            {initialsFromName(teacher.full_name)}
          </div>
          <h3 style={{ marginTop: 8, fontSize: 19, fontWeight: 600 }}>{teacher.full_name}</h3>
          <div style={{ marginTop: 5 }}>
            <span className="badge" style={{ background: 'rgba(51,170,51,.12)', color: 'var(--success)', border: '1px solid rgba(51,170,51,.25)' }}>
              Преподаватель
            </span>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="grid2" style={{ gap: 10 }}>
            <div>
              <div className="stat-label">Телефон</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-body)' }}>{teacher.phone || '—'}</div>
            </div>
            <div>
              <div className="stat-label">Учеников</div>
              <div className="stat-val">{text(mine.length)}</div>
            </div>
          </div>
        </div>
        {mine.length ? (
          <>
            <div style={{ marginBottom: 10 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', margin: 0 }}>Ученики преподавателя</h4>
            </div>
            {mine.map((s) => (
              <div
                key={s.id}
                className="card"
                style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                {...cardButtonProps(() => openAdminStudent(s.id))}
              >
                <div
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
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
                  {initialsFromName(s.full_name)}
                  <StudentAvatarImg student={s} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.full_name}</div>
                  <div style={{ marginTop: 4 }}>
                    <Badge>{studentStatusRu(s.status)}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="empty">Нет прикреплённых учеников</p>
        )}
      </div>
    </>
  )
}

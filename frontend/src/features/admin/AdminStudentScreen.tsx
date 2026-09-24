import type { ReactNode } from 'react'
import { useApp } from '../../app/store'
import { studentStatusRu, studentTrackRu, text } from '../../domain/format'
import { Badge } from '../../ui/Badge'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { StudentAvatarImg } from '../../ui/StudentAvatar'
import { WorkCard } from '../students/WorksSection'
import { openAdminChat } from './actions'
import { useAdminStudentProfile, type AdminStudentProfile } from './api'

/**
 * Секция работ у администратора: `section.card.ba-works` с заголовком `h4` без подзаголовка.
 */
function WorksSection({ children }: { children: ReactNode }) {
  return (
    <section className="card ba-works">
      <h4 style={{ fontSize: 17, fontWeight: 650, color: 'var(--gold)', margin: 0 }}>Мои работы</h4>
      {children}
    </section>
  )
}

function Profile({ st, works }: { st: AdminStudentProfile; works: ReactNode }) {
  const avg = st.average_rating != null ? Number(st.average_rating).toFixed(2) : '—'
  const teachers = (st.teachers || []).map((t) => t.full_name).filter(Boolean).join(', ') || '—'
  return (
    <>
      <section className="ba-pos-relative" style={{ position: 'relative', minHeight: 320, overflow: 'hidden', background: '#111', borderRadius: '0 0 28px 28px' }}>
        {st.has_avatar ? (
          <StudentAvatarImg student={st} rounded={false} />
        ) : (
          <img
            src="/demo-student-barber.png"
            alt={`Демонстрационный профиль ${st.full_name}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.04) 25%,rgba(0,0,0,.86) 100%)' }} />
        <img
          src="/academy-role-logo.jpg"
          alt="MADCAP Academy"
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            width: 44,
            height: 44,
            objectFit: 'cover',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,.7)',
          }}
        />
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 42, color: '#fff' }}>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-body)', letterSpacing: '1.4px', textTransform: 'uppercase', opacity: 0.82, marginBottom: 7 }}>
            MADCAP ACADEMY · ПРОФИЛЬ УЧЕНИКА
          </div>
          <h1 style={{ margin: 0, fontSize: 29, lineHeight: 1.05, fontWeight: 650 }}>{st.full_name}</h1>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge>{studentStatusRu(st.status)}</Badge>
            <Badge>{studentTrackRu(st.student_track || 'student')}</Badge>
          </div>
        </div>
      </section>
      <div
        className="card ba-pos-relative"
        style={{ position: 'relative', margin: '-30px 14px 14px', borderRadius: 22, boxShadow: '0 12px 28px rgba(0,0,0,.18)' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
          <div>
            <div className="stat-label">Занятий</div>
            <div className="stat-val">{text(st.lessons_count ?? '—')}</div>
          </div>
          <div>
            <div className="stat-label">Ср. балл</div>
            <div className="stat-val">{avg}</div>
          </div>
          <div>
            <div className="stat-label">Метро</div>
            <div className="stat-val" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {st.metro || '—'}
            </div>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <div className="stat-label">Преподаватели</div>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-body)' }}>{teachers}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 14px' }}>
        <section className="card" style={{ marginBottom: 14, padding: 18 }}>
          <h4 style={{ fontSize: 19, fontWeight: 650, margin: '0 0 8px' }}>Обо мне</h4>
          <p style={{ margin: 0, color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.65 }}>
            {st.about_me || 'Ученик пока не заполнил информацию о себе.'}
          </p>
        </section>
        <section className="card" style={{ marginBottom: 14, padding: 18 }}>
          <div className="stat-label">Телефон · виден администратору</div>
          <div style={{ fontSize: 14, fontFamily: 'var(--font-body)', marginTop: 5 }}>{st.phone || '—'}</div>
        </section>
        <button className="btn bs btn-w" style={{ marginBottom: 16 }} onClick={() => openAdminChat(st.id, st.full_name || '')}>
          {ICO.chat}
          {' Чат с учеником'}
        </button>
        <WorksSection>{works}</WorksSection>
      </div>
    </>
  )
}

/** Карточка ученика у администратора. */
export function AdminStudentScreen() {
  const studentId = useApp((s) => s.adminStudentId)
  const query = useAdminStudentProfile(studentId)
  const st = query.data?.student ?? null
  const items = query.data?.homeworks ?? []
  const works = items.length ? items.map((hw) => <WorkCard key={hw.id} hw={hw} />) : query.isSuccess ? <p className="empty">Нет работ</p> : null
  return (
    <>
      <Header title={st?.full_name || 'Ученик'} onBack={() => useApp.getState().back()} />
      <div className="scr fi" style={{ padding: 14, paddingTop: 12 }}>
        {query.isPending && <p className="empty">Загрузка…</p>}
        {query.isError && <p className="empty">{query.error.message || 'Ошибка'}</p>}
        {query.isSuccess && st ? <Profile st={st} works={works} /> : works}
      </div>
    </>
  )
}

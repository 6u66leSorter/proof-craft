import type { ReactNode } from 'react'
import { guestStudentAvatarUrl } from '../../api/files'
import { useApp } from '../../app/store'
import { studentTrackRu, text } from '../../domain/format'
import { contentTypeRu, homeworkTitle } from '../../domain/homework'
import { cardButtonProps, iconButtonLabel } from '../../ui/a11y'
import { AuthImg } from '../../ui/AuthImg'
import { Badge } from '../../ui/Badge'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { useGuestStudentPortfolio, type GuestHomework, type GuestStudent } from './api'

const DEMO_IMAGES = ['/demo-homework-fade.png', '/demo-homework-crop.png', '/demo-homework-beard.png']

const back = () => useApp.getState().back()

function WorkBadge({ hw }: { hw: GuestHomework }) {
  if (hw.status === 'pending' || hw.status === 'revision') {
    return (
      <span
        className="badge"
        style={{ background: 'rgba(218,170,34,.1)', color: 'var(--warn)', border: '1px solid rgba(218,170,34,.18)', fontSize: 12 }}
      >
        На проверке
      </span>
    )
  }
  if (hw.rating != null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 3, color: 'var(--gold)' }}>
        {ICO.star}
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)' }}>{String(hw.rating)}</span>
      </div>
    )
  }
  return (
    <span
      className="badge"
      style={{ background: 'rgba(58,170,58,.12)', color: 'var(--success)', border: '1px solid rgba(58,170,58,.22)', fontSize: 12 }}
    >
      Проверено
    </span>
  )
}

function WorkCard({ hw }: { hw: GuestHomework }) {
  const title = homeworkTitle(hw)
  // Известный дефект, сохранённый ради паритета: вместо фото работы — статичная демо-картинка (см. FRONTEND_PLAN).
  const previewImage = DEMO_IMAGES[Number(hw.id) % 3]
  const open = () => useApp.getState().go('guest-hw-view', { homework: hw })
  return (
    <article className="card" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden', borderRadius: 18 }} {...cardButtonProps(open)}>
      <img src={previewImage} alt={title} style={{ width: '100%', height: 112, objectFit: 'cover', display: 'block' }} />
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)' }}>{contentTypeRu(hw.content_type)}</div>
        <div style={{ marginTop: 8 }}>
          <WorkBadge hw={hw} />
        </div>
      </div>
    </article>
  )
}

function Profile({ student, works }: { student: GuestStudent; works: ReactNode }) {
  const teachersLine = (student.teachers || []).map((t) => t.full_name).filter(Boolean).join(', ') || '—'
  const avg = student.average_rating != null ? Number(student.average_rating).toFixed(2) : '—'
  return (
    <>
      <section className="ba-pos-relative" style={{ position: 'relative', minHeight: 330, overflow: 'hidden', background: '#17130e', borderRadius: '0 0 28px 28px' }}>
        {student.has_avatar ? (
          <AuthImg
            src={guestStudentAvatarUrl(student.id)}
            alt={`Фото ${String(student.full_name || '').trim() || 'ученика'}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <img
            src="/demo-student-barber.png"
            alt={`Портфолио ${student.full_name}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.04) 25%,rgba(0,0,0,.88) 100%)' }} />
        <img
          src="/academy-role-logo.jpg"
          alt="MADCAP Academy"
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            width: 44,
            height: 44,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '1px solid rgba(255,255,255,.65)',
          }}
        />
        <button
          className="hdr-btn"
          style={{ position: 'absolute', top: 14, right: 14, color: '#fff', background: 'rgba(0,0,0,.25)', borderRadius: '50%' }}
          onClick={back}
          {...iconButtonLabel('Назад')}
        >
          {ICO.back}
        </button>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 46, color: '#fff' }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              opacity: 0.82,
              marginBottom: 7,
            }}
          >
            MADCAP ACADEMY · УЧЕНИК
          </div>
          <h1 style={{ fontSize: 29, lineHeight: 1.05, margin: 0, letterSpacing: '-.6px' }}>{student.full_name}</h1>
          <div style={{ marginTop: 10 }}>
            <Badge>{studentTrackRu(student.student_track || 'student')}</Badge>
          </div>
        </div>
      </section>
      <div className="card ba-pos-relative" style={{ position: 'relative', margin: '-32px 14px 14px', borderRadius: 22, boxShadow: '0 12px 28px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
          <div>
            <div className="stat-label">Занятий</div>
            <div className="stat-val">{text(student.lessons_count ?? '—')}</div>
          </div>
          <div>
            <div className="stat-label">Ср. балл</div>
            <div className="stat-val">{avg}</div>
          </div>
          <div>
            <div className="stat-label">Метро</div>
            <div className="stat-val" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {student.metro || '—'}
            </div>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <div className="stat-label">Преподаватели</div>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-body)' }}>{teachersLine}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 14px' }}>
        <section className="card" style={{ marginBottom: 14, padding: 18 }}>
          <h4 style={{ fontSize: 19, margin: '0 0 8px' }}>Обо мне</h4>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.65, color: 'var(--dim)', margin: 0 }}>
            {student.about_me || 'Ученик пока не заполнил информацию о себе.'}
          </p>
        </section>
        <section className="card ba-works" style={{ padding: 18 }}>
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 17, color: 'var(--gold)', margin: 0 }}>Мои работы</h4>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--dim)', margin: '4px 0 0' }}>Учебные задания и результаты</p>
          </div>
          {works}
        </section>
      </div>
    </>
  )
}

export function GuestStudentScreen() {
  const studentId = useApp((s) => s.guestStudentId)
  const query = useGuestStudentPortfolio(studentId)

  if (query.isPending) {
    return (
      <>
        <Header title="Ученик" onBack={back} />
        <div className="scr fi" style={{ padding: 14 }}>
          <p className="empty">Загрузка…</p>
        </div>
      </>
    )
  }

  const homeworks = query.data?.homeworks ?? []
  const works = query.isError ? (
    <p className="empty">{query.error.message || 'Ошибка'}</p>
  ) : !homeworks.length ? (
    <p className="empty">Нет работ</p>
  ) : (
    <div className="grid2" style={{ padding: '0 14px 14px', marginTop: -1 }}>
      {homeworks.map((hw) => (
        <WorkCard key={hw.id} hw={hw} />
      ))}
    </div>
  )

  const student = query.data?.student
  // Без профиля (ошибка загрузки) блок работ остаётся прямо на экране.
  return <div className="scr fi">{student ? <Profile student={student} works={works} /> : works}</div>
}

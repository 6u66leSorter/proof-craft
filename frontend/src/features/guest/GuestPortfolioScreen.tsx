import { guestStudentAvatarUrl } from '../../api/files'
import { useApp } from '../../app/store'
import { STUDENT_TRACKS, text } from '../../domain/format'
import { toggleTheme } from '../../platform/theme'
import { cardButtonProps, iconButtonLabel } from '../../ui/a11y'
import { AuthImg } from '../../ui/AuthImg'
import { ICO } from '../../ui/icons'
import { useGuestPortfolio, type GuestPortfolioStudent } from './api'
import { exitGuest } from './exitGuest'

const DEMO_IMAGES = ['/demo-homework-fade.png', '/demo-homework-crop.png', '/demo-homework-beard.png']

const trackOf = (s: GuestPortfolioStudent) => s.student_track || 'student'

function StudentCard({ student, index }: { student: GuestPortfolioStudent; index: number }) {
  const avg = student.average_rating != null ? Number(student.average_rating).toFixed(1) : '—'
  const open = () => {
    useApp.getState().patch({ guestStudentId: student.id })
    useApp.getState().go('guest-student')
  }
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', borderRadius: 20 }} {...cardButtonProps(open)}>
      <div style={{ position: 'relative', height: 150, background: 'var(--gold-dim)', overflow: 'hidden' }}>
        {student.has_avatar ? (
          <AuthImg
            src={guestStudentAvatarUrl(student.id)}
            alt={`Фото ${String(student.full_name || '').trim() || 'ученика'}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <img
            src={DEMO_IMAGES[index % DEMO_IMAGES.length]}
            alt={`Работа ученика ${student.full_name}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 48%,rgba(0,0,0,.62) 100%)' }} />
        <span style={{ position: 'absolute', left: 10, bottom: 9, color: '#fff', fontFamily: 'var(--font-body)', fontSize: 12 }}>
          {`${text(student.works_count || 0)} работ`}
        </span>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25 }}>{student.full_name}</div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 6,
            marginTop: 7,
            color: 'var(--dim)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
          }}
        >
          <span>{`★ ${avg}`}</span>
          <span>{`🚇 ${student.metro || '—'}`}</span>
        </div>
      </div>
    </article>
  )
}

export function GuestPortfolioScreen() {
  const guestTrack = useApp((s) => s.guestTrack)
  const canBack = useApp((s) => s.stack.length > 0)
  const portfolio = useGuestPortfolio()
  const students = portfolio.data ?? []
  const visible = students.filter((s) => trackOf(s) === guestTrack)

  let inner
  if (portfolio.isPending) {
    inner = (
      <div className="card" style={{ padding: 30, textAlign: 'center' }}>
        <p className="empty" style={{ margin: 0 }}>
          Загружаем работы учеников…
        </p>
      </div>
    )
  } else if (portfolio.isError) {
    inner = <p className="empty">{portfolio.error.message || 'Ошибка загрузки'}</p>
  } else if (!visible.length) {
    inner = <p className="empty">В этой категории пока нет профилей.</p>
  } else {
    inner = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
        {visible.map((s, index) => (
          <StudentCard key={s.id} student={s} index={index} />
        ))}
      </div>
    )
  }

  return (
    <div className="scr fi" style={{ padding: '0 0 24px' }}>
      <section
        style={{
          padding: '18px 16px 28px',
          background: 'linear-gradient(145deg,var(--card) 0%,var(--bg) 100%)',
          borderRadius: '0 0 28px 28px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <img
            src="/academy-role-logo.jpg"
            alt="MADCAP Academy"
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 5px 18px rgba(0,0,0,.14)' }}
          />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {canBack && (
              <button className="hdr-btn" onClick={() => useApp.getState().back()} {...iconButtonLabel('Назад')}>
                {ICO.back}
              </button>
            )}
            <button
              type="button"
              className="hdr-btn"
              style={{ color: 'var(--text)' }}
              onClick={toggleTheme}
              aria-label="Сменить светлую и тёмную тему"
            >
              ◐
            </button>
            <button type="button" className="hdr-btn" style={{ color: 'var(--dim)' }} onClick={exitGuest} {...iconButtonLabel('Выйти')}>
              {ICO.logout}
            </button>
          </div>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            letterSpacing: '1.5px',
            color: 'var(--gold)',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          MADCAP ACADEMY
        </div>
        <h1 style={{ fontSize: 31, lineHeight: 1.05, margin: '0 0 10px', letterSpacing: '-.7px' }}>
          Работы наших
          <br />
          учеников
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.6, color: 'var(--dim)', margin: 0, maxWidth: 350 }}>
          Посмотрите путь учеников, их учебные работы и результаты в профессии барбера.
        </p>
      </section>
      <div style={{ padding: '18px 14px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 13 }}>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Портфолио</h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--dim)', margin: '4px 0 0' }}>
              Выберите ученика, чтобы открыть его работы
            </p>
          </div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--gold)' }}>{`${students.length} профилей`}</span>
        </div>
        <nav className="ba-student-categories" aria-label="Категории учеников">
          {STUDENT_TRACKS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`btn bs ${guestTrack === key ? 'bf' : ''}`}
              aria-pressed={guestTrack === key}
              onClick={() => useApp.getState().patch({ guestTrack: key })}
            >
              {label}
              <span>{students.filter((s) => trackOf(s) === key).length}</span>
            </button>
          ))}
        </nav>
        {inner}
      </div>
    </div>
  )
}

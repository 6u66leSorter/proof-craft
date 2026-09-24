import { ownAvatarUrl } from '../../api/files'
import { logout } from '../../app/bootstrap'
import { useApp } from '../../app/store'
import { initialsFromName, studentStatusRu, studentTrackRu, text } from '../../domain/format'
import { toggleTheme } from '../../platform/theme'
import { iconButtonLabel } from '../../ui/a11y'
import { AuthImg } from '../../ui/AuthImg'
import { Badge } from '../../ui/Badge'
import { ICO } from '../../ui/icons'
import { VkLinkTelegramCard } from '../account/VkLinkTelegramCard'
import { changeAvatar, openProfileEdit } from './actions'
import { useStudentHomeworks } from './api'
import { FeedbackPromo } from './FeedbackPromo'
import { HomeworksGrid } from './HomeworksGrid'

const heroButton = {
  position: 'absolute',
  top: 14,
  color: '#fff',
  background: 'rgba(255,255,255,.15)',
  backdropFilter: 'blur(8px)',
  borderRadius: '50%',
} as const

const setTab = (tab: string) => useApp.getState().setTab(tab)

function TeacherCard({ name }: { name: string }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8 }}>
      <div
        style={{
          position: 'relative',
          width: 52,
          height: 52,
          flex: '0 0 52px',
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'var(--gold-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gold)',
          fontSize: 15,
          fontWeight: 800,
        }}
      >
        <img
          src="/academy-role-logo.jpg"
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.25 }}
        />
        <span style={{ position: 'relative' }}>{initialsFromName(name)}</span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--dim)',
            marginBottom: 3,
            textTransform: 'uppercase',
            letterSpacing: '.7px',
          }}
        >
          Ваш преподаватель
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name || 'Преподаватель'}
        </div>
      </div>
      {/* Legacy polishScreen подписывает эту кнопку как «Открыть карточку» (проверка на 'Chat' чувствительна к регистру). */}
      <button type="button" className="btn bs" style={{ padding: '8px 10px', flexShrink: 0 }} onClick={() => setTab('chat')} {...iconButtonLabel('Открыть карточку')}>
        {ICO.chat}
      </button>
    </div>
  )
}

export function HomeTab() {
  const st = useApp((s) => s.session?.student)
  const homeworks = useStudentHomeworks()
  const fullName = String(st?.full_name || '').trim() || 'Ученик'
  const ratingsCount = Number(st?.ratings_count || 0)
  const avg = st?.average_rating != null && ratingsCount > 0 ? Number(st.average_rating).toFixed(1) : '—'
  const teachers = Array.isArray(st?.teachers) ? st.teachers : []
  const teachersLine = teachers.map((t) => String(t.full_name || '').trim()).filter(Boolean).join(', ')

  return (
    <div className="scr fi" style={{ padding: '0 0 14px' }}>
      <div className="fi" style={{ padding: 0 }}>
        <section
          className="ba-pos-relative"
          style={{
            position: 'relative',
            minHeight: 340,
            overflow: 'hidden',
            background: 'linear-gradient(145deg,#211d15 0%,#080808 72%)',
            borderRadius: '0 0 28px 28px',
            cursor: 'pointer',
          }}
          onClick={changeAvatar}
          title="Нажмите, чтобы изменить фото"
        >
          {st?.has_avatar ? (
            <AuthImg
              src={ownAvatarUrl()}
              alt={`Фото ${fullName}`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <img
              src="/academy-role-logo.jpg"
              alt="MADCAP Academy"
              style={{
                position: 'absolute',
                inset: 0,
                margin: 'auto',
                width: 150,
                height: 150,
                objectFit: 'cover',
                borderRadius: '50%',
                opacity: 0.32,
                filter: 'grayscale(.2)',
              }}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.06) 26%,rgba(0,0,0,.82) 100%)' }} />
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
              border: '1px solid rgba(255,255,255,.65)',
              boxShadow: '0 4px 15px rgba(0,0,0,.28)',
            }}
          />
          <button
            type="button"
            className="hdr-btn"
            style={{ ...heroButton, right: 54 }}
            onClick={(event) => {
              event.stopPropagation()
              toggleTheme()
            }}
            aria-label="Сменить светлую и тёмную тему"
          >
            ◐
          </button>
          <button
            type="button"
            className="hdr-btn"
            style={{ ...heroButton, right: 14 }}
            onClick={(event) => {
              event.stopPropagation()
              logout()
            }}
            {...iconButtonLabel('Выйти')}
          >
            {ICO.logout}
          </button>
          <div style={{ position: 'absolute', left: 20, right: 20, bottom: 72, color: '#fff' }}>
            <div
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-body)',
                letterSpacing: '1.4px',
                textTransform: 'uppercase',
                opacity: 0.8,
                marginBottom: 7,
              }}
            >
              MADCAP ACADEMY · УЧЕНИК
            </div>
            <h1 style={{ margin: 0, fontSize: 29, lineHeight: 1.05, fontWeight: 650, letterSpacing: '-.6px' }}>{fullName}</h1>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Badge>{studentStatusRu(st?.status)}</Badge>
              <Badge>{studentTrackRu(st?.student_track || 'student')}</Badge>
            </div>
          </div>
          <span
            style={{
              position: 'absolute',
              right: 18,
              bottom: 18,
              width: 30,
              height: 30,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,.9)',
              color: '#1a1712',
              fontSize: 14,
            }}
          >
            ✎
          </span>
        </section>
        <div
          className="card ba-pos-relative"
          style={{ position: 'relative', margin: '-48px 14px 12px', borderRadius: 22, boxShadow: '0 12px 28px rgba(0,0,0,.22)' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
            <div>
              <div className="stat-label">Занятий</div>
              <div className="stat-val">{text(st?.lessons_count ?? '—')}</div>
            </div>
            <div>
              <div className="stat-label">Ср. балл</div>
              <div className="stat-val">{avg}</div>
            </div>
            <div>
              <div className="stat-label">Метро</div>
              <div
                className="stat-val"
                style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={st?.metro || 'Не указано'}
              >
                {st?.metro || '—'}
              </div>
            </div>
            {teachersLine && (
              <div style={{ gridColumn: 'span 3' }}>
                <div className="stat-label">{`Преподавател${teachers.length > 1 ? 'и' : 'ь'}`}</div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-body)' }}>{teachersLine}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ padding: '0 14px' }}>
        <VkLinkTelegramCard />
        <button type="button" className="btn bs btn-w" style={{ marginBottom: 14 }} onClick={openProfileEdit}>
          Редактировать профиль
        </button>
        <section className="card" style={{ marginBottom: 14, padding: 18 }}>
          <h4 style={{ fontSize: 19, fontWeight: 650, color: 'var(--text)', margin: '0 0 8px' }}>Обо мне</h4>
          <p style={{ margin: 0, color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.65 }}>
            {st?.about_me || 'Расскажите немного о себе в разделе «Профиль».'}
          </p>
        </section>
        <section className="card" style={{ marginBottom: 18, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h4 style={{ fontSize: 17, fontWeight: 650, color: 'var(--gold)', margin: 0 }}>Мои работы</h4>
              <p style={{ margin: '3px 0 0', color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12 }}>
                Домашние задания и результаты обучения
              </p>
            </div>
            <button className="btn bs" onClick={() => useApp.getState().go('hw-new')}>
              ＋ ДЗ
            </button>
          </div>
          <HomeworksGrid limit={3} />
          {(homeworks.data?.length ?? 0) > 3 && (
            <button type="button" className="btn bs btn-w" style={{ marginTop: 12 }} onClick={() => setTab('works')}>
              Показать все работы
            </button>
          )}
        </section>
        <section className="card" style={{ marginTop: 0, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 10 }}>
            <div>
              <h4 style={{ fontSize: 17, fontWeight: 650, color: 'var(--gold)', margin: 0 }}>Мой преподаватель</h4>
              <p style={{ margin: '3px 0 0', color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12 }}>
                Задавайте вопросы и получайте обратную связь
              </p>
            </div>
          </div>
          {teachers.length ? (
            teachers.map((t) => <TeacherCard key={t.id} name={t.full_name} />)
          ) : (
            <div className="card" style={{ padding: 14, color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12 }}>
              Преподаватель будет назначен после модерации.
            </div>
          )}
        </section>
      </div>
      <FeedbackPromo />
    </div>
  )
}

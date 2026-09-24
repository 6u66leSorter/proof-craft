import { useState } from 'react'
import { logout } from '../../app/bootstrap'
import { useApp } from '../../app/store'
import { initialsFromName, studentStatusRu, text } from '../../domain/format'
import { cardButtonProps, iconButtonLabel } from '../../ui/a11y'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { StudentAvatarImg } from '../../ui/StudentAvatar'
import { TabBar } from '../../ui/TabBar'
import { VkLinkTelegramCard } from '../account/VkLinkTelegramCard'
import { NotificationsList } from '../notifications/NotificationsList'
import { matchesSearch, StudentSearchPanel, StudentSearchToggle, useStudentSearch } from '../students/StudentSearch'
import { openTeacherStudent, saveTeacherAbout } from './actions'
import { useTeacherDashboard, useTeacherStudents, type TeacherStudent } from './api'

const logoutButton = (
  <button className="hdr-btn" style={{ color: 'var(--dim)' }} onClick={logout} {...iconButtonLabel('Выйти')}>
    {ICO.logout}
  </button>
)

const setTab = (tab: string) => useApp.getState().setTab(tab)

function ProfileTab() {
  const teacher = useApp((s) => s.session?.teacher)
  const students = useTeacherStudents()
  const dashboard = useTeacherDashboard()
  const [about, setAbout] = useState(teacher?.about_me || '')
  const pending = Number(dashboard.data?.pendingCount || 0)
  return (
    <>
      <Header title="Профиль преподавателя" right={logoutButton} />
      <div className="scr fi" style={{ padding: 14 }}>
        <section className="card" style={{ padding: 22, textAlign: 'center', marginBottom: 14 }}>
          <div
            style={{
              position: 'relative',
              width: 76,
              height: 76,
              borderRadius: '50%',
              overflow: 'hidden',
              background: 'var(--gold-dim)',
              margin: '0 auto 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold)',
              fontWeight: 800,
              fontSize: 21,
            }}
          >
            <img
              src="/academy-role-logo.jpg"
              alt=""
              style={{ position: 'absolute', inset: 0, width: 76, height: 76, objectFit: 'cover', opacity: 0.25 }}
            />
            <span style={{ position: 'relative' }}>{initialsFromName(teacher?.full_name || 'П')}</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{teacher?.full_name || 'Преподаватель'}</h2>
          <p
            style={{
              margin: '6px 0 0',
              color: 'var(--gold)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '1.1px',
            }}
          >
            MADCAP ACADEMY · ПРЕПОДАВАТЕЛЬ
          </p>
        </section>
        <section className="card" style={{ padding: 18, marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Обо мне</h3>
          <textarea
            className="inp"
            id="teacher-about"
            rows={4}
            maxLength={1000}
            placeholder="Расскажите ученикам о себе…"
            aria-label="Расскажите ученикам о себе…"
            value={about}
            onChange={(event) => setAbout(event.target.value)}
          />
          <button type="button" className="btn bs btn-w" style={{ marginTop: 10 }} onClick={() => void saveTeacherAbout(about)}>
            Сохранить
          </button>
        </section>
        <button
          type="button"
          className="card"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: 18,
            marginBottom: 14,
            cursor: 'pointer',
            borderColor: pending ? 'rgba(201,162,39,.55)' : 'var(--border)',
          }}
          onClick={() => setTab('review')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: 'var(--gold)',
                color: '#16120a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {ICO.check}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gold)' }}>Проверить</div>
              <div style={{ marginTop: 4, color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12 }}>
                {pending ? `Новых работ на проверку: ${pending}` : 'Новых работ на проверку нет'}
              </div>
            </div>
            <div style={{ fontSize: 26, color: 'var(--gold)' }}>›</div>
          </div>
        </button>
        <section className="card" style={{ padding: 18 }}>
          <div className="grid2">
            <div>
              <div className="stat-label">Мои ученики</div>
              <div className="stat-val">{text(students.data?.length ?? 0)}</div>
            </div>
            <div>
              <div className="stat-label">На проверке</div>
              <div className="stat-val" style={{ color: 'var(--gold)' }}>
                {text(pending)}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

function ReviewTab() {
  const dashboard = useTeacherDashboard()
  useTeacherStudents()
  const students = dashboard.data?.students ?? []
  return (
    <>
      <Header title="Проверить" right={logoutButton} />
      <div className="scr fi" style={{ padding: 14 }}>
        <p style={{ margin: '0 0 14px', color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.5 }}>
          Здесь появляются только ученики, которые отправили домашнее задание и ждут вашей проверки.
        </p>
        {dashboard.isPending && <p className="empty">Загрузка…</p>}
        {dashboard.isError && <p className="empty">{dashboard.error.message || 'Ошибка'}</p>}
        {dashboard.isSuccess && !students.length && <p className="empty">Новых работ на проверку нет</p>}
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            className="card"
            style={{
              display: 'flex',
              width: '100%',
              textAlign: 'left',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              marginBottom: 10,
              cursor: 'pointer',
            }}
            onClick={() => openTeacherStudent(s.id, s.full_name)}
          >
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                width: 45,
                height: 45,
                borderRadius: '50%',
                background: 'var(--gold-dim)',
                color: 'var(--gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
              }}
            >
              {initialsFromName(s.full_name)}
              <StudentAvatarImg student={s} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-body)', fontSize: 13 }}>{s.full_name}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--warn)', marginTop: 4 }}>
                {`На проверке: ${text(s.pending_count)} ДЗ`}
              </div>
            </div>
            <span className="badge" style={{ background: 'var(--gold-dim)', color: 'var(--gold)' }}>
              Проверить
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function StudentRow({ s, hidden }: { s: TeacherStudent; hidden: boolean }) {
  const pending = Number(s.pending_homeworks_count || 0)
  const avg = s.average_rating != null ? Number(s.average_rating).toFixed(2) : '—'
  const teachers = (s.teachers || []).map((t) => t.full_name).filter(Boolean)
  return (
    <div
      className="card"
      data-student-name={s.full_name}
      data-student-track={s.student_track || 'student'}
      hidden={hidden}
      style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
      {...cardButtonProps(() => openTeacherStudent(s.id, s.full_name))}
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)' }}>{s.full_name}</div>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', lineHeight: 1.5, marginTop: 4 }}>
          <span style={{ color: 'var(--text)' }}>{studentStatusRu(s.status)}</span>
          {` · ${text(s.lessons_count ?? '—')} зан.${pending ? ' · ' : ''}`}
          {pending ? <span style={{ color: 'var(--warn)' }}>{`ДЗ на проверке: ${pending}`}</span> : null}
        </div>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', marginTop: 4 }}>
          {'Ср. балл: '}
          <span style={{ color: 'var(--gold)' }}>{avg}</span>
          {` · Преп.: ${teachers.length ? teachers.join(', ') : 'не назначен'}`}
        </div>
      </div>
    </div>
  )
}

function StudentsTab() {
  const query = useTeacherStudents()
  const search = useStudentSearch('teacher')
  const items = query.data ?? []
  return (
    <>
      <Header
        title="Мои ученики"
        right={
          <>
            <StudentSearchToggle scope="teacher" />
            {logoutButton}
          </>
        }
      />
      <div className="scr" style={{ padding: 12 }}>
        <StudentSearchPanel
          scope="teacher"
          students={items}
          loaded={query.isSuccess}
          onOpenSingle={(s) => openTeacherStudent(s.id, s.full_name)}
        >
          <VkLinkTelegramCard />
          {query.isPending && <p className="empty">Загрузка…</p>}
          {query.isError && <p className="empty">{query.error.message || 'Ошибка'}</p>}
          {items.length
            ? items.map((s) => <StudentRow key={s.id} s={s} hidden={!matchesSearch(search, s)} />)
            : query.isSuccess && <p className="empty">Нет учеников</p>}
        </StudentSearchPanel>
      </div>
    </>
  )
}

function NotificationsTab() {
  return (
    <>
      <Header title="Уведомления" right={logoutButton} />
      <div className="scr" style={{ padding: 12 }}>
        <VkLinkTelegramCard />
        <NotificationsList />
      </div>
    </>
  )
}

const TABS = ['profile', 'review', 'students', 'notifs'] as const

/** Кабинет преподавателя (legacy `renderTeacher`). */
export function TeacherScreen() {
  const tab = useApp((s) => (TABS.includes(s.tab as (typeof TABS)[number]) ? s.tab : 'profile')) as (typeof TABS)[number]
  const unread = useApp((s) => Number(s.session?.unread_notifications_count || 0))
  const dashboard = useTeacherDashboard({ refetchOnMount: false })
  return (
    <>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'review' && <ReviewTab />}
      {tab === 'students' && <StudentsTab />}
      {tab === 'notifs' && <NotificationsTab />}
      <TabBar
        active={tab}
        onSelect={setTab}
        tabs={[
          { key: 'profile', icon: ICO.user, label: 'Профиль' },
          { key: 'review', icon: ICO.check, label: 'Проверить', count: Number(dashboard.data?.pendingCount || 0) },
          { key: 'students', icon: ICO.users, label: 'Ученики' },
          { key: 'notifs', icon: ICO.bell, label: 'Увед.', count: unread },
        ]}
      />
    </>
  )
}

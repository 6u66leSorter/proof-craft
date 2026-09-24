import { useState } from 'react'
import { logout } from '../../app/bootstrap'
import { useApp } from '../../app/store'
import { toggleTheme } from '../../platform/theme'
import { iconButtonLabel } from '../../ui/a11y'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { TabBar } from '../../ui/TabBar'
import { VkLinkTelegramCard } from '../account/VkLinkTelegramCard'
import { ChatPanel } from '../chat/ChatPanel'
import { NotificationsList } from '../notifications/NotificationsList'
import { openProfileEdit, saveAbout } from './actions'
import { FeedbackPromo } from './FeedbackPromo'
import { HomeTab } from './HomeTab'
import { HomeworksGrid } from './HomeworksGrid'
import { ProfileEditModal } from './ProfileEditModal'

const logoutButton = (
  <button className="hdr-btn" style={{ color: 'var(--dim)' }} onClick={logout} {...iconButtonLabel('Выйти')}>
    {ICO.logout}
  </button>
)

const goNewHomework = () => useApp.getState().go('hw-new')

function WorksTab() {
  return (
    <>
      <Header
        title="Мои работы"
        right={
          <button className="hdr-btn" style={{ color: 'var(--dim)' }} onClick={goNewHomework}>
            ＋
          </button>
        }
      />
      <div className="scr fi" style={{ padding: 14 }}>
        <p style={{ margin: '0 0 14px', color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.5 }}>
          Нажмите на работу, чтобы увидеть фотографии, описание, статус и комментарий преподавателя.
        </p>
        <HomeworksGrid />
        <button type="button" className="btn bf btn-w" style={{ marginTop: 16 }} onClick={goNewHomework}>
          ＋ Добавить домашнее задание
        </button>
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

function ChatTab() {
  return (
    <>
      <Header title="Чат" right={logoutButton} />
      <ChatPanel />
    </>
  )
}

function ProfileTab() {
  const st = useApp((s) => s.session?.student)
  const [about, setAbout] = useState(st?.about_me || '')
  return (
    <>
      <Header title="Профиль" right={logoutButton} />
      <div className="scr fi" style={{ padding: 14 }}>
        <div className="card">
          <div className="stat-label">Имя</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{st?.full_name || '—'}</div>
          <div className="stat-label">Метро</div>
          <div style={{ fontSize: 14, marginBottom: 14 }}>{st?.metro || 'Не указано'}</div>
          <div className="stat-label">Телефон</div>
          <div style={{ fontSize: 14 }}>{st?.phone || '—'}</div>
        </div>
        <section className="card" style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Обо мне</h3>
          <textarea
            className="inp"
            id="about-me"
            rows={5}
            maxLength={1000}
            placeholder="Расскажите немного о себе…"
            aria-label="Расскажите немного о себе…"
            value={about}
            onChange={(event) => setAbout(event.target.value)}
          />
          <button type="button" className="btn bf btn-w" style={{ marginTop: 10 }} onClick={() => void saveAbout(about)}>
            Сохранить
          </button>
        </section>
        <button type="button" className="btn bs btn-w" style={{ marginTop: 14 }} onClick={openProfileEdit}>
          Редактировать данные
        </button>
        <button type="button" className="btn bs btn-w" style={{ marginTop: 10 }} onClick={toggleTheme}>
          Сменить тему
        </button>
        <FeedbackPromo />
      </div>
    </>
  )
}

const TABS = ['home', 'works', 'chat', 'notifs', 'profile'] as const

/** Кабинет ученика с нижними вкладками (legacy `renderStudent`). */
export function StudentScreen() {
  const tab = useApp((s) => (TABS.includes(s.tab as (typeof TABS)[number]) ? s.tab : 'home')) as (typeof TABS)[number]
  const unread = useApp((s) => Number(s.session?.unread_notifications_count || 0))
  return (
    <>
      {tab === 'home' && <HomeTab />}
      {tab === 'works' && <WorksTab />}
      {tab === 'notifs' && <NotificationsTab />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'profile' && <ProfileTab />}
      <ProfileEditModal />
      <TabBar
        active={tab}
        onSelect={(key) => useApp.getState().setTab(key)}
        tabs={[
          { key: 'home', icon: ICO.user, label: 'Главная' },
          { key: 'works', icon: ICO.book, label: 'Работы' },
          { key: 'chat', icon: ICO.chat, label: 'Чат' },
          { key: 'notifs', icon: ICO.bell, label: 'Увед.', count: unread },
          { key: 'profile', icon: ICO.gear, label: 'Профиль' },
        ]}
      />
    </>
  )
}

import { useState, type ReactNode } from 'react'
import { logout, retry } from '../../app/bootstrap'
import { useApp } from '../../app/store'
import { iconButtonLabel } from '../../ui/a11y'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { GuestPortfolioScreen } from '../guest/GuestPortfolioScreen'
import { submitStudentRegistration, submitTeacherApplication } from './register'
import { RegisterRoleScreen } from './RegisterRoleScreen'
import { VkBindCard } from './VkBindCard'

const back = () => useApp.getState().back()

const logoutButton = (
  <button type="button" className="hdr-btn" style={{ color: 'var(--dim)' }} onClick={logout} {...iconButtonLabel('Выйти')}>
    {ICO.logout}
  </button>
)

type FieldProps = {
  id: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  last?: boolean
  inputMode?: 'numeric'
}

/** Поле анкеты: legacy `polishScreen` дублирует placeholder в aria-label. */
function Field({ id, placeholder, value, onChange, last, inputMode }: FieldProps) {
  return (
    <input
      className="inp"
      id={id}
      placeholder={placeholder}
      aria-label={placeholder}
      inputMode={inputMode}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ marginBottom: last ? 10 : 8 }}
    />
  )
}

function StudentForm() {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', metro: '', lessons: '' })
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))
  return (
    <>
      <Field id="r-fn" placeholder="Имя *" value={form.firstName} onChange={set('firstName')} />
      <Field id="r-ln" placeholder="Фамилия *" value={form.lastName} onChange={set('lastName')} />
      <Field id="r-phone" placeholder="Телефон *" value={form.phone} onChange={set('phone')} />
      <Field id="r-metro" placeholder="Станция метро" value={form.metro} onChange={set('metro')} />
      <Field id="r-lessons" placeholder="Количество занятий *" inputMode="numeric" value={form.lessons} onChange={set('lessons')} last />
      <button type="button" className="btn bf btn-w" onClick={() => void submitStudentRegistration(form)}>
        Отправить заявку
      </button>
    </>
  )
}

function TeacherForm() {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' })
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))
  return (
    <>
      <Field id="t-fn" placeholder="Имя *" value={form.firstName} onChange={set('firstName')} />
      <Field id="t-ln" placeholder="Фамилия *" value={form.lastName} onChange={set('lastName')} />
      <Field id="t-phone" placeholder="Телефон *" value={form.phone} onChange={set('phone')} last />
      <button type="button" className="btn bf btn-w" onClick={() => void submitTeacherApplication(form)}>
        Отправить заявку
      </button>
    </>
  )
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Header title={title} onBack={back} right={logoutButton} />
      <div className="scr fi" style={{ padding: 20 }}>
        {children}
      </div>
    </>
  )
}

export function RegisterFlowScreen() {
  const role = useApp((s) => s.registerRole)
  const tab = useApp((s) => (s.registerTab === 'login' ? 'login' : 'reg'))
  const applicationSent = useApp((s) => s.teacherApplicationSent)

  if (!role) return <RegisterRoleScreen />
  if (role === 'guest') return <GuestPortfolioScreen />

  if (role === 'admin') {
    return (
      <Frame title="Администратор">
        <div style={{ maxWidth: 340, margin: '0 auto' }}>
          <VkBindCard />
          <div className="card" style={{ maxWidth: 340, margin: '0 auto' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.5, color: 'var(--gold)' }}>
              Если права уже выданы, но вход не открывается, нажмите «Проверить снова».
            </p>
            <div style={{ height: 14 }} />
            <button type="button" className="btn bf btn-w" onClick={retry}>
              Проверить снова
            </button>
          </div>
        </div>
      </Frame>
    )
  }

  const title = role === 'teacher' ? 'Преподаватель' : 'Ученик'

  if (role === 'teacher' && applicationSent) {
    return (
      <Frame title={title}>
        <div style={{ maxWidth: 340, margin: '0 auto', textAlign: 'center', padding: '28px 12px' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--gold-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              color: 'var(--gold)',
              boxShadow: '0 0 20px rgba(201,162,39,.3)',
            }}
          >
            {ICO.clock}
          </div>
          <p style={{ color: 'var(--gold)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>
            Заявка отправлена!
            <br />
            Ожидайте ответа администратора.
          </p>
          <button type="button" className="btn bs" style={{ marginTop: 16 }} onClick={back}>
            Назад
          </button>
        </div>
      </Frame>
    )
  }

  const setTab = (registerTab: 'login' | 'reg') => useApp.getState().patch({ registerTab })
  let inner: ReactNode
  if (tab === 'login') {
    inner = (
      <>
        <p style={{ color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.55, marginBottom: 14 }}>
          Вы уже открыли приложение из Telegram или VK — авторизация привязана к аккаунту. Если заявку одобрили, нажмите «Проверить снова».
        </p>
        <button type="button" className="btn bf btn-w" onClick={retry}>
          Проверить снова
        </button>
      </>
    )
  } else {
    inner = role === 'teacher' ? <TeacherForm /> : <StudentForm />
  }

  return (
    <Frame title={title}>
      <div style={{ maxWidth: 340, margin: '0 auto' }}>
        <VkBindCard />
        <div style={{ display: 'flex', borderRadius: 14, overflow: 'hidden', border: '1.5px solid var(--border)', marginBottom: 18 }}>
          <button
            type="button"
            className={tab === 'login' ? 'btn bf' : 'btn'}
            style={{ flex: 1, border: 0, borderRadius: 0 }}
            onClick={() => setTab('login')}
          >
            Вход
          </button>
          <button
            type="button"
            className={tab === 'reg' ? 'btn bf' : 'btn'}
            style={{ flex: 1, border: 0, borderRadius: 0 }}
            onClick={() => setTab('reg')}
          >
            Регистрация
          </button>
        </div>
        <div id="login-form">{inner}</div>
      </div>
    </Frame>
  )
}

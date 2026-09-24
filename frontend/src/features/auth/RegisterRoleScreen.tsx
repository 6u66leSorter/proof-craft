import type { ReactNode } from 'react'
import { logout } from '../../app/bootstrap'
import { iconButtonLabel } from '../../ui/a11y'
import { ICO } from '../../ui/icons'
import { pickRegisterRole, type RegisterRole } from './register'
import { VkBindCard } from './VkBindCard'

const ROLES: { role: RegisterRole; label: string; icon: ReactNode; description: string }[] = [
  { role: 'student', label: 'Ученик', icon: ICO.user, description: 'Обучение и портфолио' },
  { role: 'teacher', label: 'Преподаватель', icon: ICO.book, description: 'Проверка заданий' },
  { role: 'admin', label: 'Администратор', icon: ICO.shield, description: 'Управление академией' },
  { role: 'guest', label: 'Гость', icon: ICO.eye, description: 'Просмотр портфолио' },
]

export function RegisterRoleScreen() {
  return (
    <div
      className="scr fi"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, minHeight: '100%' }}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img
          src="/academy-role-logo.jpg"
          alt="MADCAP Academy"
          width="160"
          height="160"
          style={{
            width: 160,
            height: 160,
            margin: '0 auto',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            boxShadow: '0 0 30px rgba(201,162,39,.3)',
          }}
        />
        <div className="gl" style={{ width: 80, margin: '12px auto' }} />
        <p style={{ color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Выберите роль
        </p>
      </div>
      {ROLES.map((x) => (
        <button
          key={x.role}
          type="button"
          onClick={() => pickRegisterRole(x.role)}
          style={{
            width: '100%',
            maxWidth: 300,
            marginBottom: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            textAlign: 'left',
            padding: '14px 18px',
            borderRadius: 16,
            border: '1.5px solid var(--gold)',
            background: 'linear-gradient(135deg,rgba(201,162,39,.2) 0%,rgba(201,162,39,.06) 100%)',
            boxShadow: '0 0 18px rgba(201,162,39,.18),inset 0 1px 0 rgba(201,162,39,.15)',
            transition: 'all .18s',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#080808',
              flexShrink: 0,
              boxShadow: '0 0 12px rgba(201,162,39,.5)',
            }}
          >
            {x.icon}
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--gold)',
                fontFamily: 'var(--font-body)',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
              }}
            >
              {x.label}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(201,162,39,.6)', fontFamily: 'var(--font-body)', marginTop: 1, letterSpacing: '.3px' }}>
              {x.description}
            </div>
          </div>
        </button>
      ))}
      <VkBindCard />
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="hdr-btn"
          style={{ border: 'none', background: 'transparent', color: 'var(--dim)' }}
          onClick={logout}
          {...iconButtonLabel('Выйти')}
        >
          {ICO.logout}
        </button>
      </div>
    </div>
  )
}

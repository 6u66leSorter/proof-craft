import { useApp } from '../../app/store'
import { cancelWebsiteLogin, startWebsiteLogin } from './webLogin'

export function WebLoginScreen() {
  const login = useApp((s) => s.webLogin)
  const waiting = login.status === 'waiting'
  const disabled = login.status === 'starting' || waiting
  return (
    <div
      className="scr fi"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, minHeight: '100%' }}
    >
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <img
          src="/academy-role-logo.jpg"
          alt="MADCAP Academy"
          width="128"
          height="128"
          style={{
            width: 128,
            height: 128,
            margin: '0 auto 18px',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            boxShadow: '0 0 30px rgba(201,162,39,.3)',
          }}
        />
        <h1 style={{ fontSize: 22, margin: '0 0 10px', color: 'var(--gold)' }}>Дневник академии</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.55, color: 'var(--dim)', margin: '0 0 20px' }}>
          Войдите через аккаунт, который уже связан с академией.
        </p>
        {waiting && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.55, margin: 0 }}>
              {`Подтвердите вход в ${login.provider === 'telegram' ? 'Telegram' : 'VK'}. Эта страница откроет дневник сама.`}
            </p>
          </div>
        )}
        {login.error && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--danger)', margin: '0 0 12px' }}>{login.error}</p>
        )}
        <button
          type="button"
          className="btn bf btn-w"
          style={{ marginBottom: 10 }}
          disabled={disabled}
          onClick={() => void startWebsiteLogin('telegram')}
        >
          Войти через Telegram
        </button>
        <button type="button" className="btn bs btn-w" disabled={disabled} onClick={() => void startWebsiteLogin('vk')}>
          Войти через VK
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '18px 0',
            color: 'var(--dim)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
          }}
        >
          <span style={{ height: 1, background: 'var(--border)', flex: 1 }} />
          или без регистрации
          <span style={{ height: 1, background: 'var(--border)', flex: 1 }} />
        </div>
        <button type="button" className="btn bs btn-w" disabled={disabled} onClick={() => window.location.assign('?guest=1')}>
          Посмотреть работы как гость
        </button>
        {waiting && (
          <button type="button" className="btn" style={{ marginTop: 12 }} onClick={cancelWebsiteLogin}>
            Отменить
          </button>
        )}
      </div>
    </div>
  )
}

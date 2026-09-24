import { useState } from 'react'
import { useApp } from '../../app/store'
import { confirmVkBind } from './register'

const linkIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#080808" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#080808" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/** Ввод кода из Telegram для входа в тот же аккаунт из VK. Только в VK. */
export function VkBindCard() {
  const platform = useApp((s) => s.platform?.platform)
  const [code, setCode] = useState('')
  if (platform !== 'vk') return null
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 300,
        margin: '0 auto 10px',
        boxSizing: 'border-box',
        borderRadius: 16,
        border: '1.5px solid var(--gold)',
        background: 'linear-gradient(135deg,rgba(201,162,39,.2) 0%,rgba(201,162,39,.06) 100%)',
        boxShadow: '0 0 18px rgba(201,162,39,.18),inset 0 1px 0 rgba(201,162,39,.15)',
        padding: '14px 18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 12px rgba(201,162,39,.5)',
          }}
        >
          {linkIcon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: 'var(--gold)',
              fontFamily: 'var(--font-body)',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              lineHeight: 1.2,
            }}
          >
            Код из Telegram
          </div>
          <p
            style={{
              fontSize: 12,
              color: 'rgba(201,162,39,.6)',
              fontFamily: 'var(--font-body)',
              marginTop: 4,
              lineHeight: 1.45,
              letterSpacing: '.3px',
            }}
          >
            В Telegram: профиль → «Сгенерировать код для VK», затем введите 4 цифры здесь.
          </p>
          <input
            className="inp"
            id="vk-bind-code"
            maxLength={4}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="0000"
            aria-label="0000"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            style={{
              marginTop: 10,
              marginBottom: 8,
              textAlign: 'center',
              fontSize: 20,
              letterSpacing: 8,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              background: 'rgba(8,8,8,.35)',
              border: '1.5px solid rgba(201,162,39,.35)',
              color: 'var(--gold)',
            }}
          />
          <button type="button" className="btn bf btn-w" style={{ width: '100%' }} onClick={() => void confirmVkBind(code)}>
            Привязать и войти
          </button>
        </div>
      </div>
    </div>
  )
}

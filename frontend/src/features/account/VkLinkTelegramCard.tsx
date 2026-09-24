import { apiPost } from '../../api/client'
import { useApp } from '../../app/store'

async function generateVkLinkCode() {
  const { platform, appUserId, vkLinkGenerate } = useApp.getState()
  useApp.getState().patch({ vkLinkGenerate: { ...vkLinkGenerate, loading: true, error: '' } })
  try {
    const data = await apiPost<{ token?: string; expires_at?: string }>(platform, '/api/account/vk-link-token', { telegram_id: appUserId })
    useApp.getState().patch({ vkLinkGenerate: { loading: false, token: data.token ?? null, expiresAt: data.expires_at ?? null, error: '' } })
  } catch (error) {
    useApp.getState().patch({
      vkLinkGenerate: { loading: false, token: null, expiresAt: null, error: (error instanceof Error && error.message) || 'Не удалось создать код' },
    })
  }
}

/** Код для входа в тот же аккаунт из VK. Только в Telegram. */
export function VkLinkTelegramCard() {
  const platform = useApp((s) => s.platform?.platform)
  const session = useApp((s) => s.session)
  const g = useApp((s) => s.vkLinkGenerate)
  if (platform !== 'telegram' || !session?.hasUser) return null
  if (session.vk_account_linked) {
    return (
      <div className="card" style={{ marginBottom: 12, borderColor: 'rgba(58,170,58,.35)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', fontFamily: 'var(--font-body)' }}>VK подключён</div>
        <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 6, lineHeight: 1.45, fontFamily: 'var(--font-body)' }}>
          Этот аккаунт можно открывать из VK Mini App.
        </p>
      </div>
    )
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 6, fontFamily: 'var(--font-body)', textTransform: 'uppercase' }}>
        Вход из VK
      </div>
      <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.45, marginBottom: 10, fontFamily: 'var(--font-body)' }}>
        Сгенерируйте 4-значный код и введите его в приложении VK, чтобы войти в этот же аккаунт.
      </p>
      {g.error && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8, fontFamily: 'var(--font-body)' }}>{g.error}</p>}
      <button
        type="button"
        className="btn bf btn-w"
        onClick={() => void generateVkLinkCode()}
        disabled={g.loading}
        style={g.loading ? { opacity: 0.6 } : undefined}
      >
        {g.loading ? 'Генерация…' : 'Сгенерировать код для VK'}
      </button>
      {g.token && (
        <div
          style={{
            textAlign: 'center',
            marginTop: 12,
            padding: 14,
            background: 'rgba(201,162,39,.08)',
            borderRadius: 14,
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: 10,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--gold)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {g.token}
          </div>
          {g.expiresAt && (
            <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8, fontFamily: 'var(--font-body)' }}>{`Действует до ${g.expiresAt}`}</div>
          )}
          <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 10, lineHeight: 1.4, fontFamily: 'var(--font-body)' }}>
            {'В VK открой это '}
            <a href="https://vk.com/app54558405" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
              ПРИЛОЖЕНИЕ 👈
            </a>
            {' и введи код на экране входа.'}
          </p>
        </div>
      )}
    </div>
  )
}

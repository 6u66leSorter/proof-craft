import { logout } from '../app/bootstrap'
import type { ScreenName } from '../app/screens'
import { Header } from '../ui/Header'

/** Временная заглушка экрана, который ещё не перенесён из legacy-клиента. */
export function NotPortedScreen({ name }: { name: ScreenName }) {
  return (
    <>
      <Header title="MADCAP Academy" />
      <div className="scr fi" style={{ padding: 16 }}>
        <div className="card">
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5 }}>
            Экран «{name}» ещё не перенесён в новый клиент.
          </p>
          <div style={{ height: 12 }} />
          <button className="btn bs btn-w" onClick={logout}>
            Выйти
          </button>
        </div>
      </div>
    </>
  )
}

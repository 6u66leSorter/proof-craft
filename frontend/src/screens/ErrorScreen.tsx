import { logout, retry } from '../app/bootstrap'
import { useApp } from '../app/store'
import { Header } from '../ui/Header'

export function ErrorScreen() {
  const error = useApp((s) => s.error)
  return (
    <>
      <Header
        title="Ошибка"
        right={
          <button className="hdr-btn" onClick={logout}>
            ⟳
          </button>
        }
      />
      <div className="scr" style={{ padding: 16 }}>
        <div className="card">
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5 }}>{error}</p>
          <div style={{ height: 12 }} />
          <button className="btn bf btn-w" onClick={retry}>
            Повторить
          </button>
        </div>
      </div>
    </>
  )
}

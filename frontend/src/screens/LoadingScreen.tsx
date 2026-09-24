import { Header } from '../ui/Header'

export function LoadingScreen() {
  return (
    <>
      <Header title="MADCAP Academy" />
      <div className="scr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty">Загружаем профиль…</div>
      </div>
    </>
  )
}

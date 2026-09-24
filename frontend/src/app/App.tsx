import { useEffect } from 'react'
import { RegisterFlowScreen } from '../features/auth/RegisterFlowScreen'
import { RegisterRoleScreen } from '../features/auth/RegisterRoleScreen'
import { WebLoginScreen } from '../features/auth/WebLoginScreen'
import { GuestHomeworkScreen } from '../features/guest/GuestHomeworkScreen'
import { GuestPortfolioScreen } from '../features/guest/GuestPortfolioScreen'
import { GuestStudentScreen } from '../features/guest/GuestStudentScreen'
import { getTelegram } from '../platform/telegram'
import { ErrorScreen } from '../screens/ErrorScreen'
import { LoadingScreen } from '../screens/LoadingScreen'
import { NotPortedScreen } from '../screens/NotPortedScreen'
import { useLightboxKeys } from '../ui/Lightbox'
import { Toasts } from '../ui/Toasts'
import { bootstrap } from './bootstrap'
import type { ScreenName } from './screens'
import { useApp } from './store'

function Screen({ name }: { name: ScreenName }) {
  switch (name) {
    case 'loading':
      return <LoadingScreen />
    case 'error':
      return <ErrorScreen />
    case 'web-login':
      return <WebLoginScreen />
    case 'register-role':
      return <RegisterRoleScreen />
    case 'register-flow':
      return <RegisterFlowScreen />
    case 'guest':
      return <GuestPortfolioScreen />
    case 'guest-student':
      return <GuestStudentScreen />
    case 'guest-hw-view':
      return <GuestHomeworkScreen />
    default:
      return <NotPortedScreen name={name} />
  }
}

/** Системная кнопка «Назад» Telegram повторяет стек экранов (legacy `syncTelegramBackButton`). */
function useTelegramBackButton() {
  const depth = useApp((s) => s.stack.length)
  const back = useApp((s) => s.back)
  useEffect(() => {
    const tg = getTelegram()
    if (!tg?.initData) return
    try {
      if (depth > 0) {
        tg.BackButton.show()
        tg.BackButton.onClick(back)
        return () => tg.BackButton.offClick(back)
      }
      tg.BackButton.hide()
    } catch {
      // старый SDK без BackButton
    }
  }, [depth, back])
}

/** StrictMode в разработке вызывает эффекты дважды; bootstrap должен стартовать один раз. */
let bootstrapped = false

export function App() {
  const scr = useApp((s) => s.scr)
  useTelegramBackButton()
  useLightboxKeys()
  useEffect(() => {
    if (bootstrapped) return
    bootstrapped = true
    void bootstrap()
  }, [])
  return (
    <>
      <Screen name={scr} />
      <Toasts />
    </>
  )
}

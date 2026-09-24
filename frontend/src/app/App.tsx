import { useEffect } from 'react'
import { getTelegram } from '../platform/telegram'
import { ErrorScreen } from '../screens/ErrorScreen'
import { LoadingScreen } from '../screens/LoadingScreen'
import { NotPortedScreen } from '../screens/NotPortedScreen'
import { bootstrap } from './bootstrap'
import type { ScreenName } from './screens'
import { useApp } from './store'

function Screen({ name }: { name: ScreenName }) {
  switch (name) {
    case 'loading':
      return <LoadingScreen />
    case 'error':
      return <ErrorScreen />
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

export function App() {
  const scr = useApp((s) => s.scr)
  useTelegramBackButton()
  useEffect(() => {
    void bootstrap()
  }, [])
  return <Screen name={scr} />
}

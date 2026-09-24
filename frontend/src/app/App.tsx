import { useEffect } from 'react'
import { RegisterFlowScreen } from '../features/auth/RegisterFlowScreen'
import { RegisterRoleScreen } from '../features/auth/RegisterRoleScreen'
import { WebLoginScreen } from '../features/auth/WebLoginScreen'
import { GuestHomeworkScreen } from '../features/guest/GuestHomeworkScreen'
import { GuestPortfolioScreen } from '../features/guest/GuestPortfolioScreen'
import { GuestStudentScreen } from '../features/guest/GuestStudentScreen'
import { HomeworkNewScreen } from '../features/homework/HomeworkNewScreen'
import { HomeworkViewScreen } from '../features/homework/HomeworkViewScreen'
import { AdminScreen } from '../features/admin/AdminScreen'
import { AdminStudentScreen } from '../features/admin/AdminStudentScreen'
import { AdminTeacherScreen } from '../features/admin/AdminTeacherScreen'
import { StaffChatScreen } from '../features/chat/StaffChatScreen'
import { TeacherScreen } from '../features/teacher/TeacherScreen'
import { TeacherStudentScreen } from '../features/teacher/TeacherStudentScreen'
import { FeedbackScreen } from '../features/student/FeedbackScreen'
import { StudentScreen } from '../features/student/StudentScreen'
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
    case 'student':
      return <StudentScreen />
    case 'feedback':
      return <FeedbackScreen />
    case 'hw-view':
      return <HomeworkViewScreen />
    case 'hw-new':
      return <HomeworkNewScreen />
    case 'teacher':
      return <TeacherScreen />
    case 't-student':
      return <TeacherStudentScreen />
    case 'admin':
      return <AdminScreen />
    case 'admin-student':
      return <AdminStudentScreen />
    case 'admin-teacher':
      return <AdminTeacherScreen />
    case 'teacher-chat':
    case 'admin-chat':
      return <StaffChatScreen />
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

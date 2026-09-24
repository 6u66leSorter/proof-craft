import { useApp } from '../../app/store'
import { STORAGE_KEYS, session } from '../../platform/storage'

/** Выход из гостевой витрины (legacy `__ba_exitGuest`). */
export function exitGuest() {
  if (new URLSearchParams(window.location.search).get('guest') === '1') {
    window.location.assign(window.location.pathname)
    return
  }
  session.remove(STORAGE_KEYS.guest)
  useApp.getState().replace('register-role', {
    isGuestMode: false,
    guestStudentId: null,
    selectedHomework: null,
    stack: [],
  })
}

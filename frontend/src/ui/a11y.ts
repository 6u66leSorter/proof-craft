import type { KeyboardEvent } from 'react'

/**
 * Кликабельная карточка-не-кнопка (legacy `polishScreen`: `.card[onclick]` получает
 * role=button, tabIndex=0 и активацию по Enter/пробелу).
 */
export const cardButtonProps = (onClick: () => void) => ({
  role: 'button' as const,
  tabIndex: 0,
  onClick,
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onClick()
    }
  },
})

/** Кнопка-иконка без текста: legacy `polishScreen` дублирует подпись в aria-label и title. */
export const iconButtonLabel = (label: string) => ({ 'aria-label': label, title: label })

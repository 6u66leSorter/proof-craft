import type { KeyboardEvent } from 'react'

/**
 * Кликабельная карточка-не-кнопка.
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

/** Кнопка-иконка без текста: подпись дублируется в aria-label и title. */
export const iconButtonLabel = (label: string) => ({ 'aria-label': label, title: label })

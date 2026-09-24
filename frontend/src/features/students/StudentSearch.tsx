import { useEffect, useRef, type ReactNode } from 'react'
import { useApp, type StudentSearchState } from '../../app/store'
import { STUDENT_TRACKS } from '../../domain/format'

type Scope = 'teacher' | 'admin'
export type SearchableStudent = { id: number; full_name: string; student_track: string | null }

const normalize = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim()

export const useStudentSearch = (scope: Scope) => useApp((s) => s.studentSearch[scope])

const patchSearch = (scope: Scope, patch: Partial<StudentSearchState>) =>
  useApp.getState().patch({ studentSearch: { ...useApp.getState().studentSearch, [scope]: { ...useApp.getState().studentSearch[scope], ...patch } } })

/** Совпадает ли ученик с поиском и категорией (legacy `addStudentSearch` → `filter`). */
export function matchesSearch(search: StudentSearchState, student: SearchableStudent) {
  const words = normalize(search.query).split(/\s+/).filter(Boolean)
  return (student.student_track || 'student') === search.track && words.every((word) => normalize(student.full_name).includes(word))
}

const searchIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="2" />
    <path d="m15 15 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/** Кнопка-лупа в шапке списка учеников. */
export function StudentSearchToggle({ scope }: { scope: Scope }) {
  const search = useStudentSearch(scope)
  return (
    <button
      type="button"
      className="hdr-btn"
      aria-label="Найти ученика"
      aria-expanded={search.open}
      onClick={() => {
        const open = !search.open
        patchSearch(scope, open ? { open } : { open, query: '' })
      }}
    >
      {searchIcon}
    </button>
  )
}

type PanelProps = {
  scope: Scope
  students: SearchableStudent[]
  loaded: boolean
  /** Enter при единственном найденном ученике открывает его. */
  onOpenSingle: (student: SearchableStudent) => void
  children: ReactNode
}

/**
 * Категории, строка поиска и список учеников с фильтрацией (legacy `addStudentSearch`, который
 * дописывает эти элементы в экран после рендера: категории и поиск — в начало `.scr`, пустое состояние — в конец).
 */
export function StudentSearchPanel({ scope, students, loaded, onOpenSingle, children }: PanelProps) {
  const search = useStudentSearch(scope)
  const inputRef = useRef<HTMLInputElement>(null)
  const wasOpen = useRef(search.open)
  // Legacy фокусирует и выделяет поле сразу при открытии панели.
  useEffect(() => {
    if (search.open && !wasOpen.current) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    wasOpen.current = search.open
  }, [search.open])
  const inTrack = students.filter((s) => (s.student_track || 'student') === search.track)
  const found = students.filter((s) => matchesSearch(search, s))
  const hasWords = normalize(search.query).split(/\s+/).filter(Boolean).length > 0
  return (
    <>
      <nav className="ba-student-categories" aria-label="Категории учеников">
        {STUDENT_TRACKS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={search.track === key ? 'btn bs bf' : 'btn bs'}
            data-track={key}
            aria-pressed={search.track === key}
            onClick={() => patchSearch(scope, { track: key })}
          >
            {label}
            <span>{students.filter((s) => (s.student_track || 'student') === key).length}</span>
          </button>
        ))}
      </nav>
      <div className="ba-student-search" hidden={!search.open}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            className="inp"
            type="search"
            placeholder="Имя или фамилия ученика"
            aria-label="Имя или фамилия ученика"
            autoComplete="off"
            value={search.query}
            onChange={(event) => patchSearch(scope, { query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') patchSearch(scope, { query: '' })
              if (event.key === 'Enter') {
                event.preventDefault()
                if (found.length === 1) onOpenSingle(found[0])
              }
            }}
          />
          <button
            type="button"
            className="btn bs"
            aria-label="Очистить поиск"
            onClick={() => {
              patchSearch(scope, { query: '' })
              inputRef.current?.focus()
            }}
          >
            Сбросить
          </button>
        </div>
        <p role="status" aria-live="polite" style={{ marginTop: 8, color: 'var(--dim)', fontSize: 12 }}>
          {loaded ? `Найдено: ${found.length} из ${inTrack.length}` : ''}
        </p>
      </div>
      {children}
      <p className="empty" role="status" hidden={!loaded || found.length > 0 || students.length === 0}>
        {hasWords ? 'В этой категории никого не нашли. Измените запрос или выберите другую категорию.' : 'В этой категории пока нет учеников.'}
      </p>
    </>
  )
}

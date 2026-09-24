import type { AdminTeacher } from './api'

/** Выбор преподавателя в стиле `.tcb` (legacy разметка с кастомной галочкой). */
export function TeacherCheckbox({
  teacher,
  className,
  checked,
  disabled,
  onChange,
}: {
  teacher: AdminTeacher
  className: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="tcb">
      <input
        type="checkbox"
        className={className}
        value={teacher.id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="tcb-box">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M20 6L9 17l-5-5" stroke="#080808" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="tcb-info">
        <div className="tcb-name">{teacher.full_name}</div>
        <div className="tcb-sub">{`Учеников: ${Number(teacher.students_count ?? 0)}`}</div>
      </div>
    </label>
  )
}

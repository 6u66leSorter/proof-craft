import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { logout } from '../../app/bootstrap'
import { useApp } from '../../app/store'
import { initialsFromName, studentStatusRu, studentTrackRu, text } from '../../domain/format'
import { iconButtonLabel } from '../../ui/a11y'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { StudentAvatarImg } from '../../ui/StudentAvatar'
import { matchesSearch, StudentSearchPanel, StudentSearchToggle, useStudentSearch } from '../students/StudentSearch'
import { openAdminChat, openAdminStudent, saveStudentSettings } from './actions'
import { useAdminStudents, useAdminTeachers, type AdminStudent, type AdminTeacher } from './api'
import { TeacherCheckbox } from './TeacherCheckbox'

const TRACK_HINT = {
  barber: 'После сохранения барбер будет откреплён от всех преподавателей. Работы и оценки сохранятся.',
  other: 'Ученик и стажёр остаются у назначенных преподавателей. После возвращения из категории «Барбер» назначьте преподавателя заново.',
}

/**
 * Настройка ученика. Legacy перерисовывает её при каждом открытии, поэтому значения берутся из данных заново;
 * подсказку и блокировку преподавателей для «Барбера» дописывает `polishScreen`.
 */
function SettingsPanel({ s, teachers, open }: { s: AdminStudent; teachers: AdminTeacher[]; open: boolean }) {
  const queryClient = useQueryClient()
  const [lessons, setLessons] = useState(String(s.lessons_count ?? ''))
  const [track, setTrack] = useState(s.student_track || 'student')
  const [teacherIds, setTeacherIds] = useState<number[]>(s.teacher_ids ?? [])
  const barber = track === 'barber'
  const toggle = () => useApp.getState().patch({ adminEditOpenId: open ? null : s.id })
  return (
    <div
      id={`admin-edit-${s.id}`}
      style={{
        display: open ? 'block' : 'none',
        marginTop: 10,
        padding: 12,
        background: 'linear-gradient(135deg,rgba(201,162,39,.06) 0%,rgba(201,162,39,.02) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 16,
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Преподаватели
        </div>
        <div className="tcb-wrap" style={{ opacity: barber ? 0.45 : 1 }}>
          {teachers.length ? (
            teachers.map((t) => (
              <TeacherCheckbox
                key={t.id}
                teacher={t}
                className={`aas-cb-${s.id}`}
                checked={teacherIds.includes(t.id)}
                disabled={barber}
                onChange={(on) => setTeacherIds((ids) => (on ? [...ids, t.id] : ids.filter((id) => id !== t.id)))}
              />
            ))
          ) : (
            <p className="empty" style={{ padding: 8, fontSize: 12 }}>
              Нет преподавателей
            </p>
          )}
        </div>
      </div>
      <input
        className="inp"
        id={`aas-lessons-${s.id}`}
        type="number"
        min="0"
        placeholder="Кол-во занятий"
        aria-label="Кол-во занятий"
        value={lessons}
        onChange={(event) => setLessons(event.target.value)}
        style={{ fontSize: 12, marginBottom: 6 }}
      />
      <label htmlFor={`aas-track-${s.id}`} className="stat-label" style={{ display: 'block', margin: '8px 0 5px' }}>
        Категория ученика
      </label>
      <select
        className="inp"
        id={`aas-track-${s.id}`}
        style={{ fontSize: 12, marginBottom: 8 }}
        value={track}
        onChange={(event) => setTrack(event.target.value as typeof track)}
      >
        <option value="student">Ученик</option>
        <option value="intern">Стажёр</option>
        <option value="barber">Барбер</option>
      </select>
      <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.5, margin: '8px 0' }}>{barber ? TRACK_HINT.barber : TRACK_HINT.other}</p>
      <div style={{ display: 'flex', gap: 5 }}>
        <button
          className="btn bf bs"
          style={{ flex: 1 }}
          onClick={() => void saveStudentSettings(queryClient, s.id, { lessons, track, teacherIds: teachers.map((t) => t.id).filter((id) => teacherIds.includes(id)) })}
        >
          {ICO.check}
          {' Сохранить'}
        </button>
        <button className="btn bs" style={{ flex: 1 }} onClick={toggle}>
          Отмена
        </button>
      </div>
    </div>
  )
}

function StudentCard({ s, teachers, hidden }: { s: AdminStudent; teachers: AdminTeacher[]; hidden: boolean }) {
  const editOpen = useApp((st) => st.adminEditOpenId === s.id)
  const pendingHw = Number(s.pending_homeworks_count || 0)
  const avg = s.average_rating != null ? Number(s.average_rating).toFixed(2) : '—'
  const track = s.student_track || 'student'
  const assigned = (s.teachers || []).length > 0
  const teacherLine = (s.teachers || []).map((t) => t.full_name).join(', ') || 'не назначен'
  const toggle = () => useApp.getState().patch({ adminEditOpenId: editOpen ? null : s.id })
  return (
    <div className="card" data-student-name={s.full_name} data-student-track={track} hidden={hidden} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(201,162,39,.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 13,
            color: 'var(--gold)',
            flexShrink: 0,
          }}
        >
          {initialsFromName(s.full_name)}
          <StudentAvatarImg student={s} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)' }}>{s.full_name}</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', lineHeight: 1.5, marginTop: 3 }}>
            {`${s.phone || '—'} · ${studentStatusRu(s.status)} · ${studentTrackRu(track)} · ${text(s.lessons_count ?? '—')} зан.${pendingHw ? ' · ' : ''}`}
            {pendingHw ? <span style={{ color: 'var(--warn)' }}>{`ДЗ: ${pendingHw}`}</span> : null}
            <br />
            {'Преп.: '}
            <span style={{ color: assigned ? 'var(--text)' : 'var(--warn)' }}>{teacherLine}</span>
            <br />
            {'Ср. балл: '}
            <span style={{ color: 'var(--gold)' }}>{avg}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
        {/* Legacy polishScreen заменяет title «Профиль» подписью «Открыть карточку». */}
        <button className="btn bs" onClick={() => openAdminStudent(s.id)} {...iconButtonLabel('Открыть карточку')}>
          {ICO.eye}
        </button>
        <button className="btn bs" onClick={toggle}>
          {ICO.gear}
          {' Настроить'}
        </button>
        <button className="btn bs" onClick={() => openAdminChat(s.id, s.full_name || '')} {...iconButtonLabel('Открыть чат')}>
          {ICO.chat}
        </button>
      </div>
      <SettingsPanel key={String(editOpen)} s={s} teachers={teachers} open={editOpen} />
    </div>
  )
}

const logoutButton = (
  <button className="hdr-btn" style={{ color: 'var(--dim)' }} onClick={logout} {...iconButtonLabel('Выйти')}>
    {ICO.logout}
  </button>
)

/** Все ученики с поиском и настройкой (legacy вкладка `students`). */
export function StudentsTab() {
  const students = useAdminStudents()
  const teachers = useAdminTeachers()
  const search = useStudentSearch('admin')
  const items = students.data ?? []
  return (
    <>
      <Header
        title={`Ученики${items.length ? ` (${items.length})` : ''}`}
        right={
          <>
            <StudentSearchToggle scope="admin" />
            {logoutButton}
          </>
        }
      />
      <div className="scr" style={{ padding: 12 }}>
        <StudentSearchPanel scope="admin" students={items} loaded={students.isSuccess} onOpenSingle={(s) => openAdminStudent(s.id)}>
          {students.isPending && <p className="empty">Загрузка…</p>}
          {students.isError && <p className="empty">{students.error.message || 'Ошибка'}</p>}
          {items.length
            ? items.map((s) => <StudentCard key={s.id} s={s} teachers={teachers.data ?? []} hidden={!matchesSearch(search, s)} />)
            : students.isSuccess && <p className="empty">Нет учеников</p>}
        </StudentSearchPanel>
      </div>
    </>
  )
}

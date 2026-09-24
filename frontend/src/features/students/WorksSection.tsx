import type { ReactNode } from 'react'
import { useApp } from '../../app/store'
import { homeworkStatusRu } from '../../domain/format'
import { homeworkTitle } from '../../domain/homework'
import { cardButtonProps } from '../../ui/a11y'
import { AuthImg } from '../../ui/AuthImg'
import { ICO } from '../../ui/icons'
import type { StudentHomework } from '../student/api'
import { homeworkPhotoMeta } from '../student/HomeworksGrid'

/**
 * Работа в профиле ученика у преподавателя и администратора: карточка `ba-work` с миниатюрой.
 */
export function WorkCard({ hw }: { hw: StudentHomework }) {
  const { thumbUrl } = homeworkPhotoMeta(hw)
  const open = () => useApp.getState().go('hw-view', { homework: hw })
  return (
    <div className="card ba-work" style={{ marginBottom: 8, cursor: 'pointer' }} {...cardButtonProps(open)}>
      {thumbUrl ? <AuthImg src={thumbUrl} alt="" /> : <span className="ba-work-placeholder">{ICO.camera}</span>}
      <div>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12 }}>{homeworkTitle(hw)}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>{homeworkStatusRu(hw.status)}</div>
      </div>
    </div>
  )
}

/** Секция «Мои работы» со списком работ (класс `ba-works`). */
export function WorksSection({ children }: { children: ReactNode }) {
  return (
    <section className="card ba-works" style={{ padding: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 17, fontWeight: 650, color: 'var(--gold)', margin: 0 }}>Мои работы</h4>
        <p style={{ margin: '3px 0 0', color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12 }}>
          Домашние задания и результаты обучения
        </p>
      </div>
      {children}
    </section>
  )
}

import type { ReactNode } from 'react'
import { homeworkAttachmentFileUrl, homeworkFileUrl } from '../../api/files'
import { useApp } from '../../app/store'
import { homeworkTitle } from '../../domain/homework'
import { cardButtonProps } from '../../ui/a11y'
import { AuthImg } from '../../ui/AuthImg'
import { ICO } from '../../ui/icons'
import { useStudentHomeworks, type StudentHomework } from './api'

const hasFile = (f: { has_local_file?: boolean; has_telegram_file?: boolean }) => Boolean(f.has_local_file || f.has_telegram_file)

/** Превью и число фото работы (legacy `homeworkPortfolioPhotoMeta`). */
export function homeworkPhotoMeta(hw: StudentHomework) {
  const primary = hw.content_type === 'photo' && hasFile(hw)
  const extra = (hw.attachments ?? []).filter((a) => a.content_type === 'photo' && hasFile(a))
  const thumbUrl = primary ? homeworkFileUrl(hw.id, true) : extra.length ? homeworkAttachmentFileUrl(hw.id, extra[0].id, true) : null
  return { count: (primary ? 1 : 0) + extra.length, thumbUrl }
}

const statusBadge = (background: string, color: string, border: string, label: string) => (
  <span className="badge" style={{ background, color, border, fontSize: 12 }}>
    {label}
  </span>
)

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending') return statusBadge('rgba(218,170,34,.1)', 'var(--warn)', '1px solid rgba(218,170,34,.18)', 'На проверке')
  if (status === 'revision') return statusBadge('rgba(218,170,34,.12)', 'var(--warn)', '1px solid rgba(218,170,34,.28)', 'На доработку')
  if (status === 'rejected') return statusBadge('rgba(218,68,68,.1)', 'var(--danger)', '1px solid rgba(218,68,68,.22)', 'Отклонено')
  return statusBadge('rgba(58,170,58,.12)', 'var(--success)', '1px solid rgba(58,170,58,.22)', 'Проверено')
}

function HomeworkCard({ hw }: { hw: StudentHomework }) {
  const status = String(hw.status || '')
  const review = hw.latest_review
  const showGrade = status !== 'pending' && status !== 'revision' && review?.status === 'approved' && review.rating != null
  const { count, thumbUrl } = homeworkPhotoMeta(hw)
  const open = () => useApp.getState().go('hw-view', { homework: hw })
  let thumb: ReactNode
  if (thumbUrl) {
    thumb = (
      <div style={{ position: 'relative' }}>
        <AuthImg src={thumbUrl} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} />
        {count > 1 && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              background: 'rgba(0,0,0,.75)',
              color: 'var(--gold)',
              fontSize: 12,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 10,
              fontFamily: 'var(--font-body)',
              border: '1px solid rgba(201,162,39,.25)',
            }}
          >
            {`${count} фото`}
          </span>
        )}
      </div>
    )
  } else {
    thumb = (
      <div
        style={{
          width: '100%',
          aspectRatio: '4/3',
          background: 'linear-gradient(135deg,rgba(201,162,39,.06) 0%,rgba(201,162,39,.02) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gold)',
        }}
      >
        {ICO.scissors}
      </div>
    )
  }
  return (
    <div className="card" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }} {...cardButtonProps(open)}>
      {thumb}
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)', marginBottom: 2 }}>{homeworkTitle(hw)}</div>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)' }}>{`#${hw.is_bonus ? 'бонус' : (hw.lesson_number ?? '—')}`}</div>
        {showGrade ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 3, color: 'var(--gold)' }}>
            {ICO.star}
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)' }}>{String(review!.rating)}</span>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <StatusBadge status={status} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Сетка работ ученика (legacy `renderStudentHomeworksList`). */
export function HomeworksGrid({ limit }: { limit?: number }) {
  const query = useStudentHomeworks()
  if (query.isPending) return <p className="empty">Загружаем…</p>
  if (query.isError) return <p className="empty">{query.error.message || 'Ошибка'}</p>
  const items = query.data
  if (!items.length) return <p className="empty">Работ пока нет</p>
  const visible = limit == null ? items : items.slice(0, limit)
  return (
    <div className="grid2">
      {visible.map((hw) => (
        <HomeworkCard key={hw.id} hw={hw} />
      ))}
    </div>
  )
}

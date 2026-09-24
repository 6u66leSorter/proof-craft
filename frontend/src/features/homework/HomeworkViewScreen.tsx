import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { homeworkAttachmentFileUrl, homeworkFileUrl, homeworkRevisionFileUrl, openFile } from '../../api/files'
import { useApp } from '../../app/store'
import { homeworkStatusRu } from '../../domain/format'
import { homeworkMediaButtons, homeworkPhotoItems, homeworkTitle } from '../../domain/homework'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { Lightbox } from '../../ui/Lightbox'
import { MediaButtons } from '../../ui/MediaButtons'
import { PhotoStrip } from '../../ui/PhotoStrip'
import { toast } from '../../ui/toast'
import type { StudentHomework } from '../student/api'
import { addHomeworkComment, openHomeworkEdit, saveHomeworkReview, submitHomeworkRevision } from './actions'
import { HomeworkEditModal } from './HomeworkEditModal'

const sectionLabel = {
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 8,
  fontFamily: 'var(--font-body)',
  textTransform: 'uppercase',
  letterSpacing: '.5px',
} as const

function ApprovedGrade({ hw }: { hw: StudentHomework }) {
  const review = hw.latest_review
  if (!(hw.status === 'approved' && review && review.status === 'approved' && review.rating != null)) return null
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        <span style={{ color: 'var(--gold)' }}>{ICO.star}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{String(review.rating)}</span>
        <span style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)' }}>/5</span>
      </div>
      {review.comment && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', marginBottom: 2 }}>
            {`Замечание · ${review.teacher_name || ''}`}
          </div>
          <p style={{ fontSize: 12, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{review.comment}</p>
        </div>
      )}
    </div>
  )
}

const hasRevisionData = (hw: StudentHomework) => Boolean(hw.revision_student_text || hw.revision_has_local_file || hw.revision_has_telegram_file)

function RevisionComment({ hw }: { hw: StudentHomework }) {
  const rejected = (hw.reviews || []).find((r) => r.status === 'rejected')
  if (!rejected || !(hw.status === 'revision' || (hw.status === 'pending' && hasRevisionData(hw)))) return null
  return (
    <div
      className="card"
      style={{
        marginBottom: 10,
        borderColor: 'rgba(218,170,34,.5)',
        background: 'linear-gradient(135deg,rgba(218,170,34,.07) 0%,rgba(218,170,34,.01) 100%)',
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: 'var(--warn)',
          fontFamily: 'var(--font-body)',
          textTransform: 'uppercase',
          marginBottom: 5,
          fontWeight: 700,
          letterSpacing: '.5px',
        }}
      >
        {hw.status === 'pending' ? 'Предыдущее замечание' : 'Замечание преподавателя'}
      </div>
      {rejected.comment ? (
        <p style={{ fontSize: 13, fontFamily: 'var(--font-body)', lineHeight: 1.6, color: 'var(--text)' }}>{rejected.comment}</p>
      ) : (
        <p style={{ fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--dim)' }}>Требуется исправление</p>
      )}
      <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 6 }}>{rejected.teacher_name || ''}</div>
    </div>
  )
}

function CorrectionForm({ hw }: { hw: StudentHomework }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState(hw.revision_student_text || hw.text_content || '')
  const [file, setFile] = useState<File | null>(null)
  // После обновления работы поле показывает сохранённое на сервере исправление.
  useEffect(() => {
    setText(hw.revision_student_text || hw.text_content || '')
    setFile(null)
  }, [hw])
  return (
    <div className="card" style={{ marginTop: 8, borderColor: 'var(--gold)' }}>
      <h4 style={{ ...sectionLabel, color: 'var(--gold)' }}>Ваше исправление</h4>
      <p style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>
        Внесите правки и отправьте на повторную проверку
      </p>
      <textarea
        className="inp"
        id="hw-correction"
        placeholder="Исправленное описание..."
        aria-label="Исправленное описание..."
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <label style={{ cursor: 'pointer', marginTop: 8, display: 'block' }}>
        <input
          id="hw-correction-file"
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <div
          style={{
            width: '100%',
            minHeight: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg,rgba(201,162,39,.08) 0%,rgba(201,162,39,.02) 100%)',
            border: '2px dashed rgba(201,162,39,.25)',
            borderRadius: 14,
            color: 'var(--gold)',
            gap: 6,
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {ICO.camera}
          {' Новое фото (по желанию)'}
        </div>
      </label>
      <button
        type="button"
        className="btn bf btn-w"
        style={{ marginTop: 10 }}
        onClick={() => void submitHomeworkRevision(queryClient, hw.id, text, file)}
      >
        Отправить на проверку
      </button>
    </div>
  )
}

function CorrectionDone({ hw }: { hw: StudentHomework }) {
  if (!hasRevisionData(hw)) return null
  return (
    <div className="card" style={{ marginTop: 8, borderColor: 'var(--success)' }}>
      <h4 style={{ ...sectionLabel, color: 'var(--success)', marginBottom: 6 }}>Исправление ученика</h4>
      <p style={{ fontSize: 12, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{hw.revision_student_text || ''}</p>
      {(hw.revision_has_local_file || hw.revision_has_telegram_file) && (
        <button
          type="button"
          className="btn bs btn-w"
          style={{ marginTop: 8 }}
          onClick={() => void openFile(homeworkRevisionFileUrl(hw.id), toast)}
        >
          Открыть фото исправления
        </button>
      )}
    </div>
  )
}

function CommentsPanel({ hw, isOwner, canComment }: { hw: StudentHomework; isOwner: boolean; canComment: boolean }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  useEffect(() => setDraft(''), [hw])
  const comments = Array.isArray(hw.comments) ? hw.comments : []
  if (!canComment && !comments.length) return null
  const placeholder = isOwner ? 'Ответить на комментарий или описать исправление…' : 'Написать дополнительный комментарий…'
  return (
    <section className="card" style={{ marginTop: 12, padding: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', margin: '0 0 12px' }}>Комментарии к заданию</h4>
      {comments.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 12 }}>
          {comments.map((comment) => {
            const fromTeacher = comment.author_role === 'teacher' || comment.author_role === 'admin'
            return (
              <div
                key={comment.id}
                style={{
                  padding: '10px 11px',
                  borderRadius: 14,
                  background: fromTeacher ? 'rgba(201,162,39,.09)' : 'rgba(0,0,0,.035)',
                  border: `1px solid ${fromTeacher ? 'rgba(201,162,39,.2)' : 'var(--border)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      fontWeight: 800,
                      color: fromTeacher ? 'var(--gold)' : 'var(--text)',
                    }}
                  >
                    {`${comment.author_name ?? ''} · ${fromTeacher ? 'Преподаватель' : 'Ученик'}`}
                  </span>
                </div>
                <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.5 }}>{comment.text_content}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <p style={{ margin: '0 0 12px', color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12 }}>Комментариев пока нет.</p>
      )}
      {canComment && (
        <>
          <textarea
            className="inp"
            id="hw-thread-comment"
            rows={3}
            placeholder={placeholder}
            aria-label={placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="button"
            className="btn bf btn-w"
            style={{ marginTop: 9 }}
            onClick={async () => {
              if (await addHomeworkComment(queryClient, hw.id, draft)) setDraft('')
            }}
          >
            {isOwner ? 'Ответить' : 'Отправить комментарий'}
          </button>
        </>
      )}
    </section>
  )
}

function ReviewPanel({ hw }: { hw: StudentHomework }) {
  const queryClient = useQueryClient()
  const review = hw.latest_review
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState(review?.comment && review.status !== 'approved' ? review.comment : '')
  // Кнопка пересчитывается только после действий пользователя: до них она неактивна.
  const [touched, setTouched] = useState(false)
  const ready = touched && (rating > 0 || comment.trim().length > 0)
  const label = touched && rating === 0 && comment.trim().length > 0 ? 'Отправить комментарий' : 'Принять'
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <h4 style={{ ...sectionLabel, color: 'var(--gold)', marginBottom: 10 }}>Проверка</h4>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', marginBottom: 7, letterSpacing: '.5px' }}>
          Оценка
        </div>
        <div id="hw-stars" data-rating={rating} style={{ display: 'flex', gap: 2 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              id={`hw-star-${n}`}
              onClick={() => {
                setRating((prev) => (prev === n ? 0 : n))
                setTouched(true)
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 30,
                lineHeight: 1,
                color: n <= rating ? 'var(--gold)' : 'rgba(201,162,39,.2)',
                padding: '2px 4px',
                transition: 'color .12s',
              }}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="inp"
        id="hw-comment"
        placeholder="Комментарий (обязателен, если не ставите оценку)…"
        aria-label="Комментарий (обязателен, если не ставите оценку)…"
        rows={3}
        value={comment}
        onChange={(event) => {
          setComment(event.target.value)
          setTouched(true)
        }}
      />
      <button
        type="button"
        className="btn bf btn-w"
        id="hw-submit-btn"
        style={{ marginTop: 10, opacity: ready ? 1 : 0.4, cursor: ready ? 'pointer' : 'not-allowed' }}
        disabled={!ready}
        onClick={() => void saveHomeworkReview(queryClient, hw.id, rating, comment)}
      >
        {label}
      </button>
    </div>
  )
}

/** Просмотр работы для ученика, преподавателя и администратора. */
export function HomeworkViewScreen() {
  const hw = useApp((s) => s.selectedHomework) as StudentHomework | null
  const session = useApp((s) => s.session)
  if (!hw) return null
  const photoItems = homeworkPhotoItems(hw, homeworkFileUrl, homeworkAttachmentFileUrl)
  const buttons = homeworkMediaButtons(
    hw,
    (id) => homeworkFileUrl(id, false),
    (hid, aid) => homeworkAttachmentFileUrl(hid, aid, false),
    { skipPhotos: photoItems.length > 0 },
  )
  const studentId = session?.student?.id
  const isOwner = studentId != null && hw.student_id != null && Number(studentId) === Number(hw.student_id)
  const staff = Boolean(session?.isTeacher || session?.isAdmin)

  return (
    <>
      <Header title={`ДЗ #${hw.is_bonus ? 'бонус' : (hw.lesson_number ?? '—')}`} onBack={() => useApp.getState().back()} />
      <div className="scr fi" style={{ padding: 14 }}>
        {photoItems.length > 0 ? (
          <PhotoStrip items={photoItems} />
        ) : (
          <div
            style={{
              width: '100%',
              aspectRatio: '16/9',
              background: 'linear-gradient(135deg,rgba(201,162,39,.06) 0%,rgba(201,162,39,.02) 100%)',
              borderRadius: 16,
              border: '1.5px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold)',
              marginBottom: 12,
            }}
          >
            {ICO.scissors}
          </div>
        )}
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{homeworkTitle(hw)}</h3>
        <p style={{ color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
          {hw.text_content || ''}
        </p>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--dim)', marginBottom: 10 }}>
          {`Статус: ${homeworkStatusRu(hw.status)}`}
        </div>
        {isOwner && hw.status === 'pending' && (
          <button type="button" className="btn bs btn-w" style={{ marginBottom: 12 }} onClick={openHomeworkEdit}>
            Редактировать
          </button>
        )}
        {buttons.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <MediaButtons buttons={buttons} />
          </div>
        )}
        <ApprovedGrade hw={hw} />
        <RevisionComment hw={hw} />
        {isOwner && hw.status === 'revision' && <CorrectionForm hw={hw} />}
        <CorrectionDone hw={hw} />
        <CommentsPanel key={hw.id} hw={hw} isOwner={isOwner} canComment={isOwner || staff} />
        {staff && hw.status === 'pending' && <ReviewPanel key={hw.id} hw={hw} />}
      </div>
      <HomeworkEditModal hw={hw} />
      <Lightbox />
    </>
  )
}

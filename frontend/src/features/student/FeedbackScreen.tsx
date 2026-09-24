import { apiPost } from '../../api/client'
import { useApp } from '../../app/store'
import { Header } from '../../ui/Header'

type Subject = 'teacher' | 'academy' | 'other'

const SUBJECTS: [Subject, string][] = [
  ['teacher', 'О преподавателе'],
  ['academy', 'Об академии'],
  ['other', 'Другой вопрос'],
]

const patchFeedback = (patch: Partial<ReturnType<typeof useApp.getState>['feedback']>) =>
  useApp.getState().patch({ feedback: { ...useApp.getState().feedback, ...patch } })

/** Черновик сбрасывает ключ идемпотентности: изменённый текст — новый отзыв. */
const editDraft = (patch: { subject?: Subject; message?: string }) => {
  if (useApp.getState().feedback.busy) return
  patchFeedback({ ...patch, key: null })
}

async function sendFeedback() {
  const f = useApp.getState().feedback
  if (f.busy) return
  if (!f.message.trim()) {
    patchFeedback({ error: 'Напишите сообщение перед отправкой.' })
    return
  }
  const key = f.key || crypto.randomUUID()
  patchFeedback({ key, busy: true, error: '' })
  const { platform, appUserId } = useApp.getState()
  try {
    await apiPost(platform, '/api/student/feedback', { telegram_id: appUserId, subject: f.subject, message: f.message, request_key: key })
    patchFeedback({ sent: true, message: '', busy: false })
  } catch (error) {
    patchFeedback({ error: (error instanceof Error && error.message) || 'Не удалось отправить. Попробуйте ещё раз.', busy: false })
  }
}

const resetFeedback = () =>
  useApp.getState().patch({ feedback: { subject: 'teacher', message: '', key: null, busy: false, sent: false, error: '' } })

/** Конфиденциальный отзыв администратору. */
export function FeedbackScreen() {
  const f = useApp((s) => s.feedback)
  return (
    <>
      <Header title="Обратная связь" onBack={() => useApp.getState().back()} />
      <div className="scr" style={{ padding: 14 }}>
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 23, marginBottom: 10 }}>Как проходит обучение?</h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--dim)', marginBottom: 18 }}>
            Расскажите, что нравится, что хотелось бы изменить или с какой проблемой вы столкнулись.
          </p>
          {f.sent ? (
            <>
              <p role="status" style={{ lineHeight: 1.6 }}>
                Спасибо! Ваш отзыв отправлен администратору.
              </p>
              <button className="btn bs btn-w" style={{ marginTop: 16 }} onClick={resetFeedback}>
                Написать ещё
              </button>
            </>
          ) : (
            <>
              <label htmlFor="feedback-subject" className="stat-label">
                О чём сообщение
              </label>
              <select
                id="feedback-subject"
                className="inp"
                value={f.subject}
                onChange={(event) => editDraft({ subject: event.target.value as Subject })}
                disabled={f.busy}
              >
                {SUBJECTS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor="feedback-message" className="stat-label" style={{ display: 'block', marginTop: 16 }}>
                Ваши пожелания
              </label>
              <textarea
                id="feedback-message"
                className="inp"
                rows={7}
                maxLength={4000}
                placeholder="Что мы можем улучшить?"
                value={f.message}
                onChange={(event) => editDraft({ message: event.target.value })}
                disabled={f.busy}
              />
              <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6, margin: '12px 0' }}>
                Сообщение увидит только администратор академии вместе с вашим именем. Преподаватель не увидит отзыв и не получит уведомление о нём.
              </p>
              {f.error && (
                <p role="alert" style={{ color: 'var(--danger)', marginBottom: 12 }}>
                  {f.error}
                </p>
              )}
              <button className="btn bf btn-w" disabled={f.busy} onClick={() => void sendFeedback()}>
                {f.busy ? 'Отправка…' : 'Отправить администратору'}
              </button>
            </>
          )}
        </section>
      </div>
    </>
  )
}

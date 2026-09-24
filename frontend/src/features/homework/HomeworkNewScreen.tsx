import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useApp } from '../../app/store'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { addDraftPhotos, dismissHomeworkSubmit, removeDraftPhoto, submitHomework } from './actions'

const overlay = {
  position: 'fixed',
  inset: 0,
  zIndex: 5000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'rgba(8,8,8,.86)',
  backdropFilter: 'blur(10px)',
} as const

/** Оверлей отправки ДЗ: загрузка, успех, ошибка (legacy `renderHomeworkSubmitOverlay`). */
function SubmitOverlay() {
  const s = useApp((st) => st.hwSubmit)
  if (s.status === 'loading') {
    return (
      <div style={overlay}>
        <div
          className="card"
          style={{
            maxWidth: 300,
            width: '100%',
            textAlign: 'center',
            padding: '28px 24px',
            border: '1.5px solid var(--gold)',
            background: 'linear-gradient(165deg,rgba(201,162,39,.14) 0%,rgba(8,8,8,.97) 45%)',
            boxShadow: '0 0 40px rgba(201,162,39,.18),inset 0 1px 0 rgba(201,162,39,.1)',
          }}
        >
          <div className="ba-hw-submit-spin" style={{ marginBottom: 20 }} />
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--gold)',
              letterSpacing: '.5px',
              margin: 0,
              textTransform: 'uppercase',
            }}
          >
            Идёт отправка
          </p>
          <p style={{ fontSize: 12, color: 'rgba(201,162,39,.55)', marginTop: 10, lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
            Подождите несколько секунд
          </p>
        </div>
      </div>
    )
  }
  if (s.status === 'success') {
    return (
      <div style={overlay}>
        <div
          className="card"
          style={{
            maxWidth: 300,
            width: '100%',
            textAlign: 'center',
            padding: '30px 24px',
            border: '1.5px solid rgba(58,170,58,.5)',
            background: 'linear-gradient(165deg,rgba(58,170,58,.12) 0%,rgba(8,8,8,.97) 50%)',
            boxShadow: '0 0 32px rgba(58,170,58,.16)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(58,170,58,.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              color: 'var(--success)',
              border: '1px solid rgba(58,170,58,.4)',
            }}
          >
            {ICO.check}
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 800, color: 'var(--success)', margin: 0, letterSpacing: '.2px' }}>
            Готово
          </p>
          <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 10, lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
            Задание отправлено на проверку
          </p>
        </div>
      </div>
    )
  }
  if (s.status === 'error') {
    return (
      <div style={overlay}>
        <div
          className="card"
          style={{
            maxWidth: 300,
            width: '100%',
            textAlign: 'center',
            padding: '26px 20px',
            border: '1.5px solid rgba(218,68,68,.45)',
            boxShadow: '0 0 24px rgba(218,68,68,.1)',
          }}
        >
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 800, color: 'var(--danger)', margin: 0 }}>Не получилось</p>
          <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 10, lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
            {s.error || 'Попробуйте ещё раз.'}
          </p>
          <button type="button" className="btn bf btn-w" style={{ marginTop: 18 }} onClick={dismissHomeworkSubmit}>
            Закрыть
          </button>
        </div>
      </div>
    )
  }
  return null
}

/** Новое домашнее задание с фото (legacy `renderHwNew`). */
export function HomeworkNewScreen() {
  const queryClient = useQueryClient()
  const busy = useApp((s) => s.hwSubmit.status !== 'idle')
  const draft = useApp((s) => s.hwNewDraft)
  const [form, setForm] = useState({ isBonus: false, lesson: '', title: '', description: '' })
  return (
    <>
      <Header title="Новое задание" onBack={() => useApp.getState().back()} />
      <div className="scr fi" style={{ padding: 16, ...(busy ? { pointerEvents: 'none', opacity: 0.55 } : {}) }}>
        <div style={{ maxWidth: 380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--dim)',
                fontFamily: 'var(--font-body)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '.5px',
              }}
            >
              Фотографии работы
            </div>
            <div id="hw-photos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 6 }}>
              {draft.map((item, i) => (
                <div
                  key={item.url}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: 14,
                    overflow: 'hidden',
                    border: '1.5px solid var(--border)',
                    boxShadow: 'var(--glow)',
                  }}
                >
                  <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeDraftPhoto(i)}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,.75)',
                      border: '1px solid rgba(201,162,39,.3)',
                      color: 'var(--gold)',
                      fontSize: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label style={{ cursor: 'pointer' }}>
              <div
                style={{
                  width: '100%',
                  height: 80,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg,rgba(201,162,39,.08) 0%,rgba(201,162,39,.02) 100%)',
                  border: '2px dashed rgba(201,162,39,.25)',
                  borderRadius: 16,
                  color: 'var(--gold)',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {ICO.camera}
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                  Добавить фото
                </span>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  event.target.value = ''
                  void addDraftPhotos(files)
                }}
              />
            </label>
          </div>
          <div style={{ marginTop: 4, paddingTop: 14, borderTop: '1px solid rgba(201,162,39,.2)' }}>
            <label
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <input
                id="hw-bonus"
                type="checkbox"
                style={{ width: 18, height: 18, accentColor: 'var(--gold)', flexShrink: 0 }}
                disabled={busy}
                checked={form.isBonus}
                onChange={(event) => {
                  const isBonus = event.target.checked
                  setForm((f) => ({ ...f, isBonus, lesson: isBonus ? '' : f.lesson }))
                }}
              />
              <span>
                {'Бонусное задание '}
                <span style={{ color: 'var(--dim)', fontSize: 12 }}>(номер урока не нужен)</span>
              </span>
            </label>
          </div>
          {/* aria-label legacy ставит один раз при рендере, поэтому он не меняется вместе с placeholder. */}
          <input
            className="inp"
            id="hw-num"
            placeholder={form.isBonus ? 'Не требуется (бонус)' : 'Номер задания (урока)'}
            aria-label="Номер задания (урока)"
            disabled={busy || form.isBonus}
            value={form.lesson}
            onChange={(event) => setForm((f) => ({ ...f, lesson: event.target.value }))}
          />
          <input
            className="inp"
            id="hw-title"
            placeholder="Название стрижки"
            aria-label="Название стрижки"
            disabled={busy}
            value={form.title}
            onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
          />
          <textarea
            className="inp"
            id="hw-desc"
            placeholder="Подробное описание..."
            aria-label="Подробное описание..."
            rows={4}
            disabled={busy}
            value={form.description}
            onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
          />
          <button type="button" className="btn bf btn-w" disabled={busy} onClick={() => void submitHomework(queryClient, form)}>
            {busy ? 'Отправка…' : 'Отправить на проверку'}
          </button>
        </div>
      </div>
      <SubmitOverlay />
    </>
  )
}

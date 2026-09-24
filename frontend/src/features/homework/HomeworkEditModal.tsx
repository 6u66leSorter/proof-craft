import { useState } from 'react'
import { homeworkAttachmentFileUrl, homeworkFileUrl } from '../../api/files'
import { useApp } from '../../app/store'
import { AuthImg } from '../../ui/AuthImg'
import { ICO } from '../../ui/icons'
import type { StudentHomework } from '../student/api'
import {
  addEditPhotos,
  closeHomeworkEdit,
  removeEditAttachment,
  removeEditNewPhoto,
  removeEditPrimary,
  submitHomeworkEdit,
} from './actions'

const removeButton = {
  position: 'absolute',
  top: 4,
  right: 4,
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: 'rgba(0,0,0,.8)',
  border: '1px solid rgba(201,162,39,.3)',
  color: 'var(--gold)',
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
} as const

function Tile({ children, onRemove, fresh }: { children: React.ReactNode; onRemove: () => void; fresh?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '1',
        borderRadius: 12,
        overflow: 'hidden',
        border: fresh ? '1.5px solid rgba(201,162,39,.4)' : '1.5px solid var(--border)',
      }}
    >
      {children}
      <button type="button" onClick={onRemove} style={removeButton}>
        ×
      </button>
    </div>
  )
}

const tileImg = { width: '100%', height: '100%', objectFit: 'cover' } as const

function EditSheet({ hw }: { hw: StudentHomework }) {
  const m = useApp((s) => s.hwEdit)
  const [haircut, setHaircut] = useState(hw.haircut_name ?? '')
  const [text, setText] = useState(hw.text_content ?? '')
  const hasPrimary = Boolean(hw.has_local_file || hw.has_telegram_file)
  const attachments = (hw.attachments ?? []).filter(
    (a) => !m.removedAttachmentIds.includes(a.id) && (a.has_local_file || a.has_telegram_file),
  )
  const tiles = [
    ...(hasPrimary && !m.removedPrimary
      ? [
          <Tile key="primary" onRemove={removeEditPrimary}>
            <AuthImg src={homeworkFileUrl(hw.id, true)} alt="" style={tileImg} />
          </Tile>,
        ]
      : []),
    ...attachments.map((a) => (
      <Tile key={`a${a.id}`} onRemove={() => removeEditAttachment(a.id)}>
        <AuthImg src={homeworkAttachmentFileUrl(hw.id, a.id, true)} alt="" style={tileImg} />
      </Tile>
    )),
    ...m.newPhotos.map((p, i) => (
      <Tile key={p.url} onRemove={() => removeEditNewPhoto(i)} fresh>
        <img src={p.url} alt="" style={tileImg} />
      </Tile>
    )),
  ]
  const total = tiles.length
  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: '22px 22px 0 0',
        padding: '22px 18px 32px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 -4px 40px rgba(0,0,0,.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Редактировать ДЗ</h3>
        <button
          type="button"
          onClick={closeHomeworkEdit}
          style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <input
        className="inp"
        id="hwe-haircut"
        placeholder="Название стрижки"
        aria-label="Название стрижки"
        value={haircut}
        onChange={(event) => setHaircut(event.target.value)}
        style={{ marginBottom: 8 }}
      />
      <textarea
        className="inp"
        id="hwe-text"
        placeholder="Описание работы"
        aria-label="Описание работы"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        style={{ marginBottom: 14 }}
      />
      {total > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>{tiles}</div>}
      {total < 5 && (
        <label style={{ cursor: 'pointer', display: 'block', marginBottom: 14 }}>
          <input
            id="hwe-file"
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => {
              addEditPhotos(Array.from(event.target.files ?? []), total - m.newPhotos.length)
              event.target.value = ''
            }}
          />
          <div
            style={{
              width: '100%',
              height: 52,
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
            {` Добавить фото (ещё ${5 - total})`}
          </div>
        </label>
      )}
      {m.error && <p style={{ color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--font-body)', marginBottom: 10 }}>{m.error}</p>}
      <button type="button" className="btn bf btn-w" disabled={m.busy} onClick={() => void submitHomeworkEdit(hw.id, haircut, text)}>
        {m.busy ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  )
}

/** Правка названия, описания и фото работы на проверке. */
export function HomeworkEditModal({ hw }: { hw: StudentHomework }) {
  const open = useApp((s) => s.hwEdit.open)
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 6000,
        display: 'flex',
        alignItems: 'flex-end',
        background: 'rgba(8,8,8,.75)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeHomeworkEdit()
      }}
    >
      <EditSheet hw={hw} />
    </div>
  )
}

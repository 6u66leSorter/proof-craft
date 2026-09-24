import { useState } from 'react'
import { useApp } from '../../app/store'
import { closeProfileEdit, submitProfileEdit } from './actions'

function ModalBody() {
  const student = useApp((s) => s.session?.student)
  const modal = useApp((s) => s.profileEdit)
  const nameParts = String(student?.full_name || '').trim().split(' ')
  const [form, setForm] = useState({
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ') || '',
    phone: student?.phone || '',
    metro: student?.metro || '',
  })
  const field = (id: string, key: keyof typeof form, placeholder: string, marginBottom: number) => (
    <input
      className="inp"
      id={id}
      placeholder={placeholder}
      aria-label={placeholder}
      value={form[key]}
      onChange={(event) => setForm((f) => ({ ...f, [key]: event.target.value }))}
      style={{ marginBottom }}
    />
  )
  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: '22px 22px 0 0',
        padding: '22px 18px 32px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 -4px 40px rgba(0,0,0,.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Редактировать профиль</h3>
        <button
          type="button"
          onClick={closeProfileEdit}
          style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)', marginBottom: 16, lineHeight: 1.5 }}>
        Изменения вступят в силу после одобрения администратором.
      </p>
      {field('pe-fn', 'firstName', 'Имя *', 8)}
      {field('pe-ln', 'lastName', 'Фамилия *', 8)}
      {field('pe-phone', 'phone', 'Телефон *', 8)}
      {field('pe-metro', 'metro', 'Станция метро', 16)}
      {modal.error && (
        <p style={{ color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--font-body)', marginBottom: 10 }}>{modal.error}</p>
      )}
      <button type="button" className="btn bf btn-w" disabled={modal.busy} onClick={() => void submitProfileEdit(form)}>
        {modal.busy ? 'Отправка…' : 'Отправить заявку'}
      </button>
    </div>
  )
}

/** Заявка на изменение имени, телефона и метро (legacy `renderProfileEditModal`). */
export function ProfileEditModal() {
  const open = useApp((s) => s.profileEdit.open)
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
        if (event.target === event.currentTarget) closeProfileEdit()
      }}
    >
      <ModalBody />
    </div>
  )
}

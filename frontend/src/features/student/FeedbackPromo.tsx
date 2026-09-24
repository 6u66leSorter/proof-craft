import { useApp } from '../../app/store'

/** Карточка, которую legacy `polishScreen` дописывает в конец главной и профиля ученика. */
export function FeedbackPromo() {
  return (
    <section className="card" style={{ margin: 14, padding: 18 }}>
      <h3 style={{ fontSize: 18, marginBottom: 8 }}>Ваше мнение важно</h3>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--dim)', marginBottom: 12 }}>
        Пожелания о преподавателе и академии — лично администратору.
      </p>
      <button className="btn bs btn-w" onClick={() => useApp.getState().go('feedback')}>
        Обратная связь об обучении
      </button>
    </section>
  )
}

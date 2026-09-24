import { useToasts } from './toast'

export function Toasts() {
  const items = useToasts((s) => s.items)
  return (
    <>
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </>
  )
}

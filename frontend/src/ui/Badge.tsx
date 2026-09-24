/** Золотой бейдж. */
export function Badge({ children, color = 'var(--gold)' }: { children: string; color?: string }) {
  return (
    <span className="badge" style={{ background: 'rgba(201,162,39,.12)', color, border: '1px solid rgba(201,162,39,.25)' }}>
      {children}
    </span>
  )
}

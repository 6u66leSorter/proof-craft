import { create } from 'zustand'

type Toast = { id: number; message: string }

export const useToasts = create<{ items: Toast[] }>()(() => ({ items: [] }))

let nextId = 1

/** Всплывающее сообщение на 2.2 с (legacy `toast`). */
export function toast(message: string) {
  const id = nextId++
  useToasts.setState((s) => ({ items: [...s.items, { id, message }] }))
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 2200)
}

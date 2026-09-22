import { invalidParameters } from './invalid-parameters.error.js'

export const parsePositiveId = (value: string): number => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) return invalidParameters()
  return id
}

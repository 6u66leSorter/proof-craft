import { invalidParameters } from './invalid-parameters.error.js'

export const parsePreviewQuery = (value: unknown): boolean => {
  if (value == null) return false
  if (value === '1' || value === 'true') return true
  return invalidParameters()
}

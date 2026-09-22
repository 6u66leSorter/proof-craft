import { invalidParameters } from './invalid-parameters.error.js'

export const parseBoundedIntegerQuery = (
  value: unknown,
  options: { defaultValue: number; min: number; max: number },
): number => {
  if (value == null) return options.defaultValue
  if (typeof value !== 'string') return invalidParameters()
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) {
    return invalidParameters()
  }
  return parsed
}

import Decimal from 'decimal.js'

import { ValidationError } from './errors.js'
import type { DecimalInput, DecimalString } from './types.js'

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
})

export const MONEY_DECIMAL_PLACES = 4

export function decimal(value: DecimalInput, field: string): Decimal {
  try {
    const parsed = new Decimal(value)
    if (!parsed.isFinite()) throw new Error('not finite')
    return parsed
  } catch {
    throw new ValidationError(`${field} must be a finite decimal value`)
  }
}

export function nonNegativeDecimal(value: DecimalInput, field: string): Decimal {
  const parsed = decimal(value, field)
  if (parsed.isNegative()) {
    throw new ValidationError(`${field} must be greater than or equal to zero`)
  }
  return parsed
}

export function percentage(value: DecimalInput, field: string): Decimal {
  const parsed = nonNegativeDecimal(value, field)
  if (parsed.greaterThan(100)) {
    throw new ValidationError(`${field} must be between 0 and 100`)
  }
  return parsed
}

export function fixed(value: Decimal, places = MONEY_DECIMAL_PLACES): DecimalString {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places)
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0))
}

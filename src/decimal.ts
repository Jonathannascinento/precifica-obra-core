import { Decimal as DecimalJs } from 'decimal.js'

import { ValidationError } from './errors.js'
import type { DecimalInput, DecimalString } from './types.js'

// Keep the package's arithmetic context isolated from the consumer's decimal.js singleton.
// Calling DecimalJs.set(...) here would silently change precision and formatting application-wide.
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
})

export const MONEY_DECIMAL_PLACES = 4

export function decimal(value: DecimalInput, field: string): DecimalJs {
  try {
    const parsed = new Decimal(value)
    if (!parsed.isFinite()) throw new Error('not finite')
    return parsed
  } catch {
    throw new ValidationError(`${field} must be a finite decimal value`)
  }
}

export function nonNegativeDecimal(value: DecimalInput, field: string): DecimalJs {
  const parsed = decimal(value, field)
  if (parsed.isNegative()) {
    throw new ValidationError(`${field} must be greater than or equal to zero`)
  }
  return parsed
}

export function percentage(value: DecimalInput, field: string): DecimalJs {
  const parsed = nonNegativeDecimal(value, field)
  if (parsed.greaterThan(100)) {
    throw new ValidationError(`${field} must be between 0 and 100`)
  }
  return parsed
}

export function fixed(value: DecimalJs, places = MONEY_DECIMAL_PLACES): DecimalString {
  return value.toDecimalPlaces(places, DecimalJs.ROUND_HALF_UP).toFixed(places)
}

export function sum(values: DecimalJs[]): DecimalJs {
  return values.reduce((total, value) => total.plus(value), new Decimal(0))
}

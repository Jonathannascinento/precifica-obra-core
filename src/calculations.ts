import type { Decimal as DecimalJs } from 'decimal.js'

import { Decimal, fixed, nonNegativeDecimal, percentage, sum } from './decimal.js'
import { ValidationError } from './errors.js'
import type {
  BdiParameters,
  BdiResult,
  BudgetInput,
  BudgetResult,
  CalculatedBudgetItem,
  CalculatedCostItem,
  Composition,
  CompositionResult,
  CostCategory,
  DecimalInput,
} from './types.js'

const ZERO_TOTALS: Record<CostCategory, string> = {
  MATERIAL: '0.0000',
  LABOR: '0.0000',
  EQUIPMENT: '0.0000',
  OTHER: '0.0000',
}

const COST_CATEGORIES = new Set<CostCategory>(['MATERIAL', 'LABOR', 'EQUIPMENT', 'OTHER'])

export function calculateComposition(composition: Composition): CompositionResult {
  if (!composition.code.trim()) throw new ValidationError('composition.code is required')
  if (!composition.description.trim()) {
    throw new ValidationError('composition.description is required')
  }
  if (!composition.unit.trim()) throw new ValidationError('composition.unit is required')
  if (composition.items.length === 0) {
    throw new ValidationError('composition.items must contain at least one item')
  }

  const totals = new Map<CostCategory, DecimalJs>([
    ['MATERIAL', new Decimal(0)],
    ['LABOR', new Decimal(0)],
    ['EQUIPMENT', new Decimal(0)],
    ['OTHER', new Decimal(0)],
  ])

  const items: CalculatedCostItem[] = composition.items.map((item, index) => {
    if (!item.code.trim()) throw new ValidationError(`items[${index}].code is required`)
    if (!item.description.trim()) {
      throw new ValidationError(`items[${index}].description is required`)
    }
    if (!item.unit.trim()) throw new ValidationError(`items[${index}].unit is required`)
    if (!COST_CATEGORIES.has(item.category)) {
      throw new ValidationError(
        `items[${index}].category must be one of MATERIAL, LABOR, EQUIPMENT, OTHER`,
      )
    }

    const coefficient = nonNegativeDecimal(item.coefficient, `items[${index}].coefficient`)
    const unitPrice = nonNegativeDecimal(item.unitPrice, `items[${index}].unitPrice`)
    const charges =
      item.category === 'LABOR'
        ? sum(
            (item.laborCharges ?? []).map((charge, chargeIndex) =>
              percentage(
                charge.percentage,
                `items[${index}].laborCharges[${chargeIndex}].percentage`,
              ),
            ),
          )
        : new Decimal(0)

    const effectiveUnitPrice = unitPrice.times(charges.dividedBy(100).plus(1))
    const total = coefficient.times(effectiveUnitPrice)
    const roundedTotal = fixed(total)
    totals.set(
      item.category,
      (totals.get(item.category) ?? new Decimal(0)).plus(new Decimal(roundedTotal)),
    )

    return {
      ...item,
      coefficient: fixed(coefficient),
      unitPrice: fixed(unitPrice),
      laborChargesPercentage: fixed(charges),
      effectiveUnitPrice: fixed(effectiveUnitPrice),
      total: roundedTotal,
    }
  })

  const totalsByCategory = { ...ZERO_TOTALS }
  for (const [category, total] of totals) totalsByCategory[category] = fixed(total)

  return {
    code: composition.code,
    description: composition.description,
    unit: composition.unit,
    items,
    totalsByCategory,
    directCost: fixed(sum([...totals.values()])),
  }
}

export function calculateBdiRate(parameters: BdiParameters): DecimalJs {
  const administration = percentage(parameters.administration, 'bdi.administration').dividedBy(100)
  const insurance = percentage(parameters.insurance, 'bdi.insurance').dividedBy(100)
  const guarantees = percentage(parameters.guarantees, 'bdi.guarantees').dividedBy(100)
  const risk = percentage(parameters.risk, 'bdi.risk').dividedBy(100)
  const financialExpenses = percentage(
    parameters.financialExpenses,
    'bdi.financialExpenses',
  ).dividedBy(100)
  const taxes = percentage(parameters.taxes, 'bdi.taxes').dividedBy(100)
  const profit = percentage(parameters.profit, 'bdi.profit').dividedBy(100)

  if (taxes.greaterThanOrEqualTo(1)) {
    throw new ValidationError('bdi.taxes must be less than 100')
  }

  return new Decimal(1)
    .plus(administration.plus(insurance).plus(guarantees).plus(risk))
    .times(new Decimal(1).plus(financialExpenses))
    .times(new Decimal(1).plus(profit))
    .dividedBy(new Decimal(1).minus(taxes))
    .minus(1)
}

export function applyBdi(baseCostInput: DecimalInput, parameters: BdiParameters): BdiResult {
  const baseCost = nonNegativeDecimal(baseCostInput, 'baseCost')
  const rate = calculateBdiRate(parameters)
  const amount = baseCost.times(rate)

  return {
    baseCost: fixed(baseCost),
    bdiRate: fixed(rate.times(100)),
    bdiAmount: fixed(amount),
    finalPrice: fixed(baseCost.plus(amount)),
  }
}

export function calculateBudget(input: BudgetInput): BudgetResult {
  if (input.items.length === 0) {
    throw new ValidationError('items must contain at least one budget item')
  }

  const items: CalculatedBudgetItem[] = input.items.map((item, index) => {
    if (!item.code.trim()) throw new ValidationError(`items[${index}].code is required`)
    if (!item.description.trim()) {
      throw new ValidationError(`items[${index}].description is required`)
    }
    if (!item.unit.trim()) throw new ValidationError(`items[${index}].unit is required`)
    if (item.unitPrice === undefined && item.composition === undefined) {
      throw new ValidationError(`items[${index}] must provide unitPrice or composition`)
    }
    if (item.unitPrice !== undefined && item.composition !== undefined) {
      throw new ValidationError(`items[${index}] cannot provide both unitPrice and composition`)
    }

    const quantity = nonNegativeDecimal(item.quantity, `items[${index}].quantity`)
    const composition = item.composition ? calculateComposition(item.composition) : undefined
    const unitPrice = composition
      ? nonNegativeDecimal(composition.directCost, `items[${index}].composition.directCost`)
      : nonNegativeDecimal(item.unitPrice as DecimalInput, `items[${index}].unitPrice`)
    const total = quantity.times(unitPrice)

    return {
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: fixed(quantity),
      unitPrice: fixed(unitPrice),
      total: fixed(total),
      ...(composition ? { composition } : {}),
    }
  })

  const directCost = sum(items.map((item) => new Decimal(item.total)))
  const indirectCosts = nonNegativeDecimal(input.indirectCosts ?? 0, 'indirectCosts')
  const baseCost = directCost.plus(indirectCosts)
  const bdi = input.bdi
    ? applyBdi(baseCost.toString(), input.bdi)
    : {
        baseCost: fixed(baseCost),
        bdiRate: '0.0000',
        bdiAmount: '0.0000',
        finalPrice: fixed(baseCost),
      }

  return {
    items,
    directCost: fixed(directCost),
    indirectCosts: fixed(indirectCosts),
    baseCost: bdi.baseCost,
    bdiRate: bdi.bdiRate,
    bdiAmount: bdi.bdiAmount,
    finalPrice: bdi.finalPrice,
  }
}

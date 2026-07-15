import { describe, expect, it } from 'vitest'

import { applyBdi, calculateBudget, calculateComposition, ValidationError } from '../src/index.js'
import type { BdiParameters, Composition } from '../src/index.js'

const bdi: BdiParameters = {
  administration: '5',
  insurance: '1',
  guarantees: '0.5',
  risk: '1',
  financialExpenses: '1',
  taxes: '6',
  profit: '8',
}

const composition: Composition = {
  code: '94964',
  description: 'Concrete composition example',
  unit: 'M3',
  items: [
    {
      code: 'MAT-1',
      description: 'Material',
      unit: 'UN',
      category: 'MATERIAL',
      coefficient: '2',
      unitPrice: '100',
    },
    {
      code: 'LAB-1',
      description: 'Labor',
      unit: 'H',
      category: 'LABOR',
      coefficient: '2',
      unitPrice: '50',
      laborCharges: [
        { code: 'INSS', percentage: '20' },
        { code: 'FGTS', percentage: '8' },
        { code: 'OTHER', percentage: '40' },
      ],
    },
    {
      code: 'EQ-1',
      description: 'Equipment',
      unit: 'H',
      category: 'EQUIPMENT',
      coefficient: '1.5',
      unitPrice: '30',
    },
  ],
}

describe('calculateComposition', () => {
  it('calculates category totals and labor charges deterministically', () => {
    const result = calculateComposition(composition)

    expect(result.directCost).toBe('413.0000')
    expect(result.totalsByCategory).toEqual({
      MATERIAL: '200.0000',
      LABOR: '168.0000',
      EQUIPMENT: '45.0000',
      OTHER: '0.0000',
    })
    expect(result.items[1]).toMatchObject({
      laborChargesPercentage: '68.0000',
      effectiveUnitPrice: '84.0000',
      total: '168.0000',
    })
  })

  it('rejects invalid and negative inputs', () => {
    expect(() =>
      calculateComposition({
        ...composition,
        items: [{ ...composition.items[0]!, coefficient: '-1' }],
      }),
    ).toThrow(ValidationError)

    expect(() => calculateComposition({ ...composition, items: [] })).toThrow(
      'composition.items must contain at least one item',
    )
  })

  it('validates required metadata, item metadata, decimals, and percentages', () => {
    for (const [field, value] of [
      ['code', ''],
      ['description', ''],
      ['unit', ''],
    ] as const) {
      expect(() => calculateComposition({ ...composition, [field]: value })).toThrow(field)
    }

    for (const [field, value] of [
      ['code', ''],
      ['description', ''],
      ['unit', ''],
    ] as const) {
      expect(() =>
        calculateComposition({
          ...composition,
          items: [{ ...composition.items[0]!, [field]: value }],
        }),
      ).toThrow(field)
    }

    expect(() =>
      calculateComposition({
        ...composition,
        items: [{ ...composition.items[0]!, unitPrice: 'not-a-decimal' }],
      }),
    ).toThrow('must be a finite decimal value')
    expect(() =>
      calculateComposition({
        ...composition,
        items: [
          {
            ...composition.items[1]!,
            laborCharges: [{ code: 'INVALID', percentage: '100.01' }],
          },
        ],
      }),
    ).toThrow('must be between 0 and 100')
  })

  it('ignores labor charges on non-labor items and rounds half up to four places', () => {
    const result = calculateComposition({
      code: 'ROUND',
      description: 'Rounding',
      unit: 'UN',
      items: [
        {
          code: 'OTHER-1',
          description: 'Other',
          unit: 'UN',
          category: 'OTHER',
          coefficient: '1',
          unitPrice: '1.23455',
          laborCharges: [{ code: 'IGNORED', percentage: '50' }],
        },
      ],
    })

    expect(result.items[0]).toMatchObject({
      laborChargesPercentage: '0.0000',
      effectiveUnitPrice: '1.2346',
      total: '1.2346',
    })
  })
})

describe('applyBdi', () => {
  it('uses the compound BDI formula with half-up rounding', () => {
    expect(applyBdi('1000', bdi)).toEqual({
      baseCost: '1000.0000',
      bdiRate: '24.7457',
      bdiAmount: '247.4574',
      finalPrice: '1247.4574',
    })
  })

  it('rejects a tax percentage of 100', () => {
    expect(() => applyBdi('1000', { ...bdi, taxes: 100 })).toThrow(
      'bdi.taxes must be less than 100',
    )
  })
})

describe('calculateBudget', () => {
  it('combines explicit prices, compositions, indirect costs, and BDI', () => {
    const result = calculateBudget({
      items: [
        {
          code: 'SERV-1',
          description: 'Composition-based service',
          unit: 'M3',
          quantity: '2',
          composition,
        },
        {
          code: 'SERV-2',
          description: 'Explicit-price service',
          unit: 'UN',
          quantity: '3',
          unitPrice: '10.125',
        },
      ],
      indirectCosts: '100',
      bdi,
    })

    expect(result.directCost).toBe('856.3750')
    expect(result.baseCost).toBe('956.3750')
    expect(result.bdiRate).toBe('24.7457')
    expect(result.finalPrice).toBe('1193.0371')
    expect(result.items[0]?.composition?.directCost).toBe('413.0000')
  })

  it('requires exactly one price source per item', () => {
    expect(() =>
      calculateBudget({
        items: [
          {
            code: 'X',
            description: 'Invalid',
            unit: 'UN',
            quantity: 1,
          },
        ],
      }),
    ).toThrow('must provide unitPrice or composition')

    expect(() =>
      calculateBudget({
        items: [
          {
            code: 'X',
            description: 'Invalid',
            unit: 'UN',
            quantity: 1,
            unitPrice: 1,
            composition,
          },
        ],
      }),
    ).toThrow('cannot provide both unitPrice and composition')
  })

  it('supports a budget without BDI and validates required item fields', () => {
    expect(
      calculateBudget({
        items: [
          {
            code: 'A',
            description: 'Simple',
            unit: 'UN',
            quantity: 2,
            unitPrice: 3,
          },
        ],
      }),
    ).toMatchObject({
      directCost: '6.0000',
      indirectCosts: '0.0000',
      bdiRate: '0.0000',
      finalPrice: '6.0000',
    })

    expect(() => calculateBudget({ items: [] })).toThrow('at least one budget item')

    for (const [field, value] of [
      ['code', ''],
      ['description', ''],
      ['unit', ''],
    ] as const) {
      expect(() =>
        calculateBudget({
          items: [
            {
              code: 'A',
              description: 'Simple',
              unit: 'UN',
              quantity: 1,
              unitPrice: 1,
              [field]: value,
            },
          ],
        }),
      ).toThrow(field)
    }
  })
})

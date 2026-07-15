import { calculateBudget } from '../src/index.js'

const result = calculateBudget({
  items: [
    {
      code: 'SERVICE-001',
      description: 'Demonstration service',
      unit: 'M2',
      quantity: '25',
      unitPrice: '84.5678',
    },
  ],
  indirectCosts: '300',
  bdi: {
    administration: '5',
    insurance: '1',
    guarantees: '0.5',
    risk: '1',
    financialExpenses: '1',
    taxes: '6',
    profit: '8',
  },
})

console.log(result)

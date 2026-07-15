# Precifica Obra Core

[![CI](https://github.com/Jonathannascinento/precifica-obra-core/actions/workflows/ci.yml/badge.svg)](https://github.com/Jonathannascinento/precifica-obra-core/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/precifica-obra-core)](https://www.npmjs.com/package/precifica-obra-core)
[![license](https://img.shields.io/npm/l/precifica-obra-core)](LICENSE)

Framework-independent TypeScript toolkit for reading user-supplied SINAPI spreadsheets and
producing reproducible civil-construction cost calculations. It is the reusable domain core
extracted from an internally used budgeting application.

> This project is independent and is not affiliated with or endorsed by CAIXA, IBGE, or the
> Brazilian Federal Government. It does not redistribute SINAPI datasets. Users must obtain
> source files from the official provider and verify results for their own professional use.

[Leia em português](README.pt-BR.md)

## Why this exists

Brazilian construction estimates often start in monthly SINAPI spreadsheets and end in custom,
hard-to-audit calculations. This package makes the transformation explicit:

- normalize CSV/XLSX rows without a database or web framework;
- preserve `desonerado` and `não desonerado` prices as distinct fields;
- calculate materials, labor with social charges, equipment, and compositions;
- calculate budgets and compound BDI with deterministic decimal arithmetic;
- return row-level diagnostics instead of silently accepting malformed data.

## Install

```bash
npm install precifica-obra-core
```

Node.js 20 or newer is required.

## Quick start

```ts
import { calculateBudget, parseSinapiWorkbook } from 'precifica-obra-core'

const parsed = await parseSinapiWorkbook(fileBytes, {
  fileName: 'SINAPI_SP_2026_03.xlsx',
  state: 'SP',
  referenceMonth: '2026-03',
  category: 'SINAPI_INSUMOS',
})

const budget = calculateBudget({
  items: [
    {
      code: '94964',
      description: 'Concrete service',
      unit: 'M3',
      quantity: '10',
      unitPrice: '525.3478',
    },
  ],
  indirectCosts: '750.00',
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

console.log(parsed.records.length, parsed.diagnostics)
console.log(budget.finalPrice)
```

All public calculation outputs use strings with four decimal places. Supplying decimal strings is
recommended so values never pass through binary floating-point arithmetic.

## Public API

- `readSinapiFile` — reads CSV/XLSX rows for preview and mapping interfaces.
- `parseSinapiWorkbook` — reads the selected worksheet and normalizes its rows.
- `normalizeSinapiRows` — normalizes rows that were already extracted from another source.
- `detectSinapiColumns` — detects common Portuguese and English column names.
- `calculateComposition` — calculates coefficients, labor charges, and category totals.
- `applyBdi` — applies the compound BDI formula to a cost base.
- `calculateBudget` — combines explicit prices or compositions, indirect costs, and BDI.

See [API.md](docs/API.md) and the generated [TypeDoc site](https://jonathannascinento.github.io/precifica-obra-core/).

## Scope and guarantees

- Monetary values are rounded half-up to four decimal places at API output boundaries.
- BDI uses `((1 + AC + S + G + R) × (1 + DF) × (1 + L) / (1 - I)) - 1`.
- Duplicate SINAPI keys default to `keep-last`; `keep-first` and `error` are available.
- Invalid rows are skipped with diagnostics; configuration errors throw `ValidationError`.
- The package calculates values but does not certify engineering estimates or legal compliance.

See [VALIDATION.md](docs/VALIDATION.md) for the validation model and known limitations.

## Development

```bash
npm ci
npm run validate
npm run docs
```

Meaningful issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[roadmap](ROADMAP.md) before starting larger changes. Release notes are in the
[changelog](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Jonathan Carlos Nunes do Nascimento.

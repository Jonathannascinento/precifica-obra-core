# API reference

## SINAPI normalization

### `readSinapiFile(input, options)`

Reads a user-supplied CSV/XLSX file and returns its headers, rows, selected worksheet, and available
worksheet names without applying domain validation. This supports preview and mapping interfaces.
Legacy `.xls` files are rejected.

### `parseSinapiWorkbook(input, options)`

Asynchronously accepts an `ArrayBuffer` or `Uint8Array` from a CSV/XLSX file. The options require a Brazilian
UF, a `YYYY-MM` reference month, and an import category. The result contains normalized records,
row-level diagnostics, detected mapping, worksheet metadata, skipped rows, and duplicates.

### `normalizeSinapiRows(rows, config)`

Processes records that were extracted by another reader. Required columns are code, description,
unit, and at least one price. Duplicate keys are formed from UF, month, category, and code.

### `detectSinapiColumns(headers)`

Recognizes common variants such as `Código SINAPI`, `Descrição`, `Unidade`, `Preço Desonerado`, and
`Preço Não Desonerado`. Provide an explicit `mapping` when a source uses other names.

## Cost calculations

### `calculateComposition(composition)`

Multiplies each coefficient by its effective unit price. For labor items, the effective price
includes the sum of declared social-charge percentages. Returns line calculations, totals by
category, and direct unit cost.

### `applyBdi(baseCost, parameters)`

Applies the documented compound BDI formula. All seven components are percentages. Taxes must be
strictly below 100%.

### `calculateBudget(input)`

Each item provides either an explicit unit price or a composition. The function calculates direct
cost, adds declared indirect costs, and applies BDI when provided.

## Errors

- `ValidationError` indicates invalid configuration or domain input.
- `WorkbookError` indicates an unreadable workbook or missing worksheet.
- Row-level data errors are returned as diagnostics rather than thrown.

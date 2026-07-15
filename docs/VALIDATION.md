# Validation report

## What is validated

- Brazilian UF and `YYYY-MM` reference month.
- Required SINAPI columns and at least one price column.
- Numeric SINAPI codes, non-empty descriptions and units, and non-negative prices.
- Duplicate reference handling with explicit strategies.
- Non-negative coefficients, quantities, prices, indirect costs, and percentages.
- Labor charges and BDI components constrained to valid percentages.
- Deterministic decimal arithmetic with half-up output rounding to four places.

## Automated scenarios

The 21-test suite covers Brazilian decimal formats, accented column names, desonerado versus não
desonerado detection, invalid rows, duplicate strategies, CSV delimiters, XLSX shared strings,
metadata and sparse rows, worksheet selection, every import category, materials, labor charges,
equipment, compositions, indirect costs, compound BDI, and invalid domain inputs.

CI runs formatting, linting, strict TypeScript checks, tests with coverage thresholds, and dual
ESM/CommonJS builds on supported Node versions.

Release-candidate results on 2026-07-15:

- 92.66% statement coverage, 80.52% branch coverage, 93.40% function coverage, and 95.91% line
  coverage;
- zero known vulnerabilities from `npm audit --audit-level=low`;
- successful ESM and CommonJS smoke tests, including Node 20 and Node 22;
- npm package preview limited to ten declared files (44,693 compressed bytes; 180,136 unpacked
  bytes).

## Known limitations

- SINAPI workbook layouts can change. Unknown layouts require an explicit column mapping.
- Legacy binary `.xls` files are rejected; convert them to CSV or XLSX first.
- The library does not download, redistribute, or assert licensing over official datasets.
- The BDI formula is configurable only through its components; project-specific legal or tender
  rules remain the consumer's responsibility.
- Calculations are deterministic software outputs, not an engineering certification.

## Release verification

Before each release, maintainers run `npm run validate`, inspect `npm pack --dry-run`, scan the
history for secrets, install the tarball in a clean Node project, and compare representative
results with independently calculated fixtures.

The XLSX reader extracts only workbook metadata, shared strings, and the selected worksheet. It
enforces limits on compressed input, extracted XML, rows, columns, and cells to constrain malformed
or hostile files.

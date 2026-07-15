# Changelog

All notable changes follow [Semantic Versioning](https://semver.org/).

## 0.1.0 — 2026-07-15

### Added

- CSV/XLSX reading for user-supplied files, including shared strings, sparse rows, metadata rows,
  selected worksheets, and bounded archive extraction.
- SINAPI column detection, normalization, row diagnostics, duplicate strategies, Brazilian UFs,
  reference months, import categories, and separate desonerado/não desonerado prices.
- Deterministic four-decimal calculations for materials, labor and social charges, equipment,
  compositions, indirect costs, budgets, and compound BDI, with aggregate composition totals that
  reconcile exactly with returned rounded line totals.
- Isolated decimal arithmetic configuration and strict runtime validation for import categories,
  cost categories, and duplicate strategies.
- ESM, CommonJS, and TypeScript declaration builds for Node.js 20 and newer.
- Bilingual documentation, governance files, contribution guidance, security policy, and generated
  API documentation.
- CI, CodeQL, dependency review, Dependabot, OpenSSF Scorecard, GitHub Pages, and npm release
  automation with pinned third-party actions.

### Security

- No official SINAPI dataset is bundled or redistributed.
- Legacy `.xls` and macro-enabled inputs are outside the supported parser surface.
- Input, extracted XML, row, column, and cell limits constrain malformed XLSX files.

import { parse as parseCsv } from 'csv-parse/sync'
import type { Decimal as DecimalJs } from 'decimal.js'

import { Decimal, fixed } from './decimal.js'
import { ValidationError, WorkbookError } from './errors.js'
import { readXlsxSheet } from './xlsx-reader.js'
import type {
  ImportDiagnostic,
  NormalizeSinapiResult,
  ParseSinapiWorkbookOptions,
  ParseSinapiWorkbookResult,
  ReadSinapiFileOptions,
  ReadSinapiFileResult,
  SinapiCategory,
  SinapiColumnMapping,
  SinapiImportCategory,
  SinapiImportConfig,
  SinapiReference,
} from './types.js'

const BRAZILIAN_STATES = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
])

const SINAPI_IMPORT_CATEGORIES = new Set<SinapiImportCategory>([
  'SINAPI_INSUMOS',
  'SINAPI_COMPOSICOES',
  'SINAPI_MO',
  'SINAPI_EQUIPAMENTOS',
  'CUSTOM',
])

const DUPLICATE_STRATEGIES = new Set<NonNullable<SinapiImportConfig['duplicateStrategy']>>([
  'keep-first',
  'keep-last',
  'error',
])

function normalizedHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findHeader(headers: string[], predicates: Array<(header: string) => boolean>): string {
  for (const predicate of predicates) {
    const match = headers.find((header) => predicate(normalizedHeader(header)))
    if (match) return match
  }
  return ''
}

export function detectSinapiColumns(headers: string[]): SinapiColumnMapping {
  const code = findHeader(headers, [
    (header) => header === 'codigo',
    (header) => header === 'cod',
    (header) => header.includes('codigo sinapi'),
  ])
  const description = findHeader(headers, [
    (header) => header === 'descricao',
    (header) => header === 'desc',
    (header) => header.startsWith('descricao do '),
  ])
  const unit = findHeader(headers, [
    (header) => ['unidade', 'unid', 'un', 'unit'].includes(header),
    (header) => header === 'unidade de medida',
  ])
  const priceNaoDesonerado = findHeader(headers, [
    (header) => header.includes('nao desonerado'),
    (header) => header.includes('sem desoneracao'),
    (header) => header.includes('preco mediano'),
  ])
  const priceDesonerado = findHeader(headers, [
    (header) => header.includes('desonerado') && !header.includes('nao desonerado'),
    (header) => header.includes('com desoneracao'),
  ])
  const fallbackPrice = findHeader(headers, [
    (header) => ['preco', 'custo', 'valor'].includes(header),
  ])

  return {
    code: code || headers[0] || '',
    description: description || headers[1] || '',
    unit: unit || headers[2] || '',
    ...(priceDesonerado ? { priceDesonerado } : {}),
    ...(priceNaoDesonerado || fallbackPrice
      ? { priceNaoDesonerado: priceNaoDesonerado || fallbackPrice }
      : {}),
  }
}

export function parseBrazilianDecimal(value: unknown): DecimalJs | null {
  if (value === null || value === undefined) return null
  let cleaned = cellToString(value).trim()
  if (!cleaned || cleaned === '-') return null

  cleaned = cleaned.replace(/R\$/gi, '').replace(/\s/g, '')
  if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.')

  try {
    const parsed = new Decimal(cleaned)
    return parsed.isFinite() && !parsed.isNegative() ? parsed : null
  } catch {
    return null
  }
}

function cellToString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString()
  }
  if (value instanceof Date) return value.toISOString()
  return ''
}

function resolveCategory(category: SinapiImportCategory): SinapiCategory {
  switch (category) {
    case 'SINAPI_COMPOSICOES':
      return 'COMPOSICAO'
    case 'SINAPI_MO':
      return 'MAO_DE_OBRA'
    case 'SINAPI_EQUIPAMENTOS':
      return 'EQUIPAMENTO'
    default:
      return 'INSUMO'
  }
}

function validateConfig(config: SinapiImportConfig): { state: string; referenceMonth: string } {
  if (!SINAPI_IMPORT_CATEGORIES.has(config.category)) {
    throw new ValidationError(
      'category must be one of SINAPI_INSUMOS, SINAPI_COMPOSICOES, SINAPI_MO, SINAPI_EQUIPAMENTOS, CUSTOM',
    )
  }
  if (
    config.duplicateStrategy !== undefined &&
    !DUPLICATE_STRATEGIES.has(config.duplicateStrategy)
  ) {
    throw new ValidationError('duplicateStrategy must be one of keep-first, keep-last, error')
  }

  const state = config.state.trim().toUpperCase()
  if (!BRAZILIAN_STATES.has(state)) {
    throw new ValidationError(`state must be a valid Brazilian UF; received "${config.state}"`)
  }

  const match = /^(\d{4})-(\d{2})$/.exec(config.referenceMonth)
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new ValidationError('referenceMonth must use the YYYY-MM format')
  }

  return { state, referenceMonth: config.referenceMonth }
}

export function normalizeSinapiRows(
  rawRows: Array<Record<string, unknown>>,
  config: SinapiImportConfig,
): NormalizeSinapiResult {
  const { state, referenceMonth } = validateConfig(config)
  const headers = rawRows[0] ? Object.keys(rawRows[0]) : []
  const mapping = config.mapping ?? detectSinapiColumns(headers)
  const diagnostics: ImportDiagnostic[] = []

  for (const required of ['code', 'description', 'unit'] as const) {
    if (!mapping[required]) {
      throw new ValidationError(`Could not detect required ${required} column`)
    }
  }

  if (!mapping.priceDesonerado && !mapping.priceNaoDesonerado) {
    throw new ValidationError('Could not detect a SINAPI price column')
  }

  const recordsByKey = new Map<string, SinapiReference>()
  let skippedRows = 0
  let duplicateRows = 0
  const category = resolveCategory(config.category)
  const source = config.category === 'CUSTOM' ? 'CUSTOM' : 'SINAPI'

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2
    const code = cellToString(row[mapping.code]).trim()
    const description = cellToString(row[mapping.description]).trim()
    const unit = cellToString(row[mapping.unit]).trim()

    if (!code && !description && !unit) {
      skippedRows += 1
      return
    }

    if (!/^\d+$/.test(code)) {
      skippedRows += 1
      diagnostics.push({
        level: 'error',
        row: rowNumber,
        ...(code ? { code } : {}),
        field: 'code',
        message: 'SINAPI code must contain digits only',
      })
      return
    }

    if (!description || !unit) {
      skippedRows += 1
      diagnostics.push({
        level: 'error',
        row: rowNumber,
        code,
        field: !description ? 'description' : 'unit',
        message: !description ? 'Description is required' : 'Unit is required',
      })
      return
    }

    const desoneradoRaw = mapping.priceDesonerado ? row[mapping.priceDesonerado] : null
    const naoDesoneradoRaw = mapping.priceNaoDesonerado ? row[mapping.priceNaoDesonerado] : null
    const priceDesonerado = parseBrazilianDecimal(desoneradoRaw)
    const priceNaoDesonerado = parseBrazilianDecimal(naoDesoneradoRaw)

    if (priceDesonerado === null && priceNaoDesonerado === null) {
      skippedRows += 1
      diagnostics.push({
        level: 'error',
        row: rowNumber,
        code,
        field: 'price',
        message: 'At least one valid non-negative price is required',
      })
      return
    }

    const record: SinapiReference = {
      code,
      originCode: code,
      description,
      unit,
      state,
      referenceMonth,
      category,
      priceDesonerado: priceDesonerado ? fixed(priceDesonerado) : null,
      priceNaoDesonerado: priceNaoDesonerado ? fixed(priceNaoDesonerado) : null,
      source,
    }
    const key = `${state}:${referenceMonth}:${category}:${code}`

    if (recordsByKey.has(key)) {
      duplicateRows += 1
      const strategy = config.duplicateStrategy ?? 'keep-last'
      diagnostics.push({
        level: strategy === 'error' ? 'error' : 'warning',
        row: rowNumber,
        code,
        message: `Duplicate reference encountered; strategy=${strategy}`,
      })
      if (strategy === 'keep-first' || strategy === 'error') return
    }

    recordsByKey.set(key, record)
  })

  return {
    records: [...recordsByKey.values()],
    diagnostics,
    totalRows: rawRows.length,
    skippedRows,
    duplicateRows,
    mapping,
  }
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  return new Uint8Array(input)
}

function matrixToRows(matrix: unknown[][]): {
  headers: string[]
  rows: Array<Record<string, unknown>>
} {
  if (matrix.length === 0) return { headers: [], rows: [] }
  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map((value) => normalizedHeader(cellToString(value)))
    return (
      headers.some((header) => header === 'codigo' || header.includes('codigo sinapi')) &&
      headers.some((header) => header === 'descricao' || header.startsWith('descricao do ')) &&
      headers.some((header) => ['unidade', 'unid', 'un', 'unit'].includes(header)) &&
      headers.some((header) => /(preco|custo|valor)/.test(header))
    )
  })
  const selectedHeaderIndex = headerIndex >= 0 ? headerIndex : 0
  const headers = (matrix[selectedHeaderIndex] ?? []).map((value) => cellToString(value).trim())

  const rows = matrix.slice(selectedHeaderIndex + 1).map((values) => {
    const row: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      if (header) row[header] = values[index] ?? ''
    })
    return row
  })

  return { headers, rows }
}

function detectCsvDelimiter(contents: string): ',' | ';' | '\t' {
  const firstLine = contents.split(/\r?\n/, 1)[0] ?? ''
  const counts: Record<',' | ';' | '\t', number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false

  for (const character of firstLine) {
    if (character === '"') quoted = !quoted
    if (!quoted && (character === ',' || character === ';' || character === '\t')) {
      counts[character] += 1
    }
  }

  return (Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? ';') as
    ',' | ';' | '\t'
}

function isXlsx(buffer: Uint8Array, fileName?: string): boolean {
  if (fileName?.toLowerCase().endsWith('.xlsx')) return true
  return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04
}

export function readSinapiFile(
  input: ArrayBuffer | Uint8Array,
  options: ReadSinapiFileOptions = {},
): ReadSinapiFileResult {
  const bytes = toBytes(input)
  const lowerFileName = options.fileName?.toLowerCase()
  if (lowerFileName?.endsWith('.xls')) {
    throw new WorkbookError('Legacy .xls files are not supported; convert the file to .xlsx or CSV')
  }
  if (
    lowerFileName &&
    ['.xlsm', '.xlsb', '.xlam', '.xla'].some((extension) => lowerFileName.endsWith(extension))
  ) {
    throw new WorkbookError(
      'Macro-enabled and binary Excel files are not supported; convert the file to .xlsx or CSV',
    )
  }

  try {
    if (isXlsx(bytes, options.fileName)) {
      const selected = readXlsxSheet(bytes, options.sheetName)
      const tabular = matrixToRows(selected.data)
      return {
        ...tabular,
        sheetName: selected.sheet,
        availableSheets: selected.availableSheets,
      }
    }

    const contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const delimiter = detectCsvDelimiter(contents)
    const matrix: unknown[][] = parseCsv(contents, {
      bom: true,
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    })
    const tabular = matrixToRows(matrix)
    return {
      ...tabular,
      sheetName: 'CSV',
      availableSheets: ['CSV'],
    }
  } catch (error) {
    if (error instanceof WorkbookError) throw error
    throw new WorkbookError(
      `Unable to read file${options.fileName ? ` "${options.fileName}"` : ''}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
}

// The Promise-based API is stable even though v0.1 performs ZIP parsing synchronously.
// eslint-disable-next-line @typescript-eslint/require-await
export async function parseSinapiWorkbook(
  input: ArrayBuffer | Uint8Array,
  options: ParseSinapiWorkbookOptions,
): Promise<ParseSinapiWorkbookResult> {
  try {
    const tabular = readSinapiFile(input, options)
    const normalized = normalizeSinapiRows(tabular.rows, options)

    return {
      ...normalized,
      sheetName: tabular.sheetName,
      availableSheets: tabular.availableSheets,
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof WorkbookError) throw error
    throw new WorkbookError(
      `Unable to parse workbook${options.fileName ? ` "${options.fileName}"` : ''}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
}

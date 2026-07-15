import { strFromU8, unzipSync } from 'fflate'
import type { UnzipFileInfo, Unzipped } from 'fflate'
import { Parser } from 'saxen'

import { WorkbookError } from './errors.js'

const MAX_INPUT_BYTES = 64 * 1024 * 1024
const MAX_XML_FILE_BYTES = 128 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 192 * 1024 * 1024
const MAX_ROWS = 500_000
const MAX_COLUMNS = 512
const MAX_CELLS = 2_000_000

interface SheetReference {
  name: string
  relationId: string
  path: string
}

export interface XlsxSheetData {
  sheet: string
  data: unknown[][]
}

function localName(name: string): string {
  return name.slice(name.lastIndexOf(':') + 1)
}

function decodedAttributes(
  getAttributes: () => Record<string, string>,
  decodeEntities: (value: string) => string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(getAttributes()).map(([key, value]) => [key, decodeEntities(value)]),
  )
}

function parseXml(xml: string, configure: (parser: Parser) => void): void {
  const parser = new Parser()
  let parseError: Error | undefined
  parser.on('error', (error) => {
    parseError = error
  })
  configure(parser)
  const returnedError = parser.parse(xml)
  if (parseError) throw parseError
  if (returnedError instanceof Error) throw returnedError
}

function extractSelectedFiles(
  input: Uint8Array,
  shouldExtract: (file: UnzipFileInfo) => boolean,
): Unzipped {
  let extractedBytes = 0

  return unzipSync(input, {
    filter(file) {
      if (!shouldExtract(file)) return false
      if (file.originalSize > MAX_XML_FILE_BYTES) {
        throw new WorkbookError(`XLSX entry "${file.name}" exceeds the safe size limit`)
      }
      extractedBytes += file.originalSize
      if (extractedBytes > MAX_EXTRACTED_BYTES) {
        throw new WorkbookError('XLSX extracted content exceeds the safe size limit')
      }
      return true
    },
  })
}

function requiredXml(files: Unzipped, path: string): string {
  const bytes = files[path]
  if (!bytes) throw new WorkbookError(`Required XLSX entry "${path}" was not found`)
  return strFromU8(bytes)
}

function optionalXml(files: Unzipped, path: string): string | undefined {
  const bytes = files[path]
  return bytes ? strFromU8(bytes) : undefined
}

function parseWorkbook(xml: string): Array<Omit<SheetReference, 'path'>> {
  const sheets: Array<Omit<SheetReference, 'path'>> = []

  parseXml(xml, (parser) => {
    parser.on('openTag', (name, getAttributes, decodeEntities) => {
      if (localName(name) !== 'sheet') return
      const attributes = decodedAttributes(getAttributes, decodeEntities)
      const sheetName = attributes.name
      const relationId = attributes['r:id'] ?? attributes.id
      if (sheetName && relationId) sheets.push({ name: sheetName, relationId })
    })
  })

  return sheets
}

function resolveZipPath(baseDirectory: string, target: string): string {
  const parts = target.startsWith('/')
    ? target.slice(1).split('/')
    : `${baseDirectory}/${target}`.split('/')
  const resolved: string[] = []

  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!resolved.pop()) throw new WorkbookError(`Unsafe XLSX relationship target "${target}"`)
      continue
    }
    resolved.push(part)
  }

  return resolved.join('/')
}

function parseRelationships(xml: string): Map<string, string> {
  const relationships = new Map<string, string>()

  parseXml(xml, (parser) => {
    parser.on('openTag', (name, getAttributes, decodeEntities) => {
      if (localName(name) !== 'Relationship') return
      const attributes = decodedAttributes(getAttributes, decodeEntities)
      if (!attributes.Id || !attributes.Target) return
      relationships.set(
        attributes.Id,
        resolveZipPath('xl', attributes.Target.replaceAll('\\', '/')),
      )
    })
  })

  return relationships
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  const strings: string[] = []
  let insideItem = false
  let insideText = false
  let current = ''

  parseXml(xml, (parser) => {
    parser.on('openTag', (name) => {
      const element = localName(name)
      if (element === 'si') {
        insideItem = true
        current = ''
      } else if (insideItem && element === 't') {
        insideText = true
      }
    })
    parser.on('text', (value, decodeEntities) => {
      if (insideItem && insideText) current += decodeEntities(value)
    })
    parser.on('cdata', (value) => {
      if (insideItem && insideText) current += value
    })
    parser.on('closeTag', (name) => {
      const element = localName(name)
      if (element === 't') insideText = false
      if (element === 'si') {
        strings.push(current)
        insideItem = false
      }
    })
  })

  return strings
}

function columnIndex(reference: string): number {
  const letters = /^[A-Za-z]+/.exec(reference)?.[0]
  if (!letters) return -1
  let index = 0
  for (const letter of letters.toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64
  return index - 1
}

function cellValue(type: string, raw: string, inline: string, sharedStrings: string[]): unknown {
  if (type === 'inlineStr') return inline
  if (type === 's') {
    const index = Number.parseInt(raw, 10)
    return Number.isSafeInteger(index) ? (sharedStrings[index] ?? '') : ''
  }
  if (type === 'b') return raw === '1'
  return raw
}

function parseWorksheet(xml: string, sharedStrings: string[]): unknown[][] {
  const rows: unknown[][] = []
  let currentRow = -1
  let nextRow = 0
  let nextColumn = 0
  let cellReference = ''
  let cellType = ''
  let rawValue = ''
  let inlineValue = ''
  let insideValue = false
  let insideInlineText = false
  let cellCount = 0

  parseXml(xml, (parser) => {
    parser.on('openTag', (name, getAttributes, decodeEntities) => {
      const element = localName(name)
      const attributes = decodedAttributes(getAttributes, decodeEntities)

      if (element === 'row') {
        const declaredRow = Number.parseInt(attributes.r ?? '', 10) - 1
        currentRow = Number.isSafeInteger(declaredRow) && declaredRow >= 0 ? declaredRow : nextRow
        if (currentRow >= MAX_ROWS) throw new WorkbookError('XLSX worksheet exceeds the row limit')
        nextRow = currentRow + 1
        nextColumn = 0
        rows[currentRow] ??= []
      } else if (element === 'c') {
        cellReference = attributes.r ?? ''
        cellType = attributes.t ?? ''
        rawValue = ''
        inlineValue = ''
      } else if (element === 'v') {
        insideValue = true
      } else if (element === 't' && cellType === 'inlineStr') {
        insideInlineText = true
      }
    })

    parser.on('text', (value, decodeEntities) => {
      if (insideValue) rawValue += decodeEntities(value)
      if (insideInlineText) inlineValue += decodeEntities(value)
    })

    parser.on('cdata', (value) => {
      if (insideInlineText) inlineValue += value
    })

    parser.on('closeTag', (name) => {
      const element = localName(name)
      if (element === 'v') insideValue = false
      if (element === 't') insideInlineText = false
      if (element !== 'c') return

      const declaredColumn = columnIndex(cellReference)
      const targetColumn = declaredColumn >= 0 ? declaredColumn : nextColumn
      if (targetColumn >= MAX_COLUMNS)
        throw new WorkbookError('XLSX worksheet exceeds the column limit')
      nextColumn = targetColumn + 1
      const row = rows[currentRow]
      if (row) row[targetColumn] = cellValue(cellType, rawValue.trim(), inlineValue, sharedStrings)
      cellCount += 1
      if (cellCount > MAX_CELLS) throw new WorkbookError('XLSX worksheet exceeds the cell limit')
    })
  })

  return Array.from({ length: rows.length }, (_, index) => rows[index] ?? [])
}

export function readXlsxSheet(
  input: Uint8Array,
  requestedSheet?: string,
): XlsxSheetData & {
  availableSheets: string[]
} {
  if (input.byteLength > MAX_INPUT_BYTES) throw new WorkbookError('XLSX input exceeds 64 MiB')

  const metadata = extractSelectedFiles(
    input,
    (file) => file.name === 'xl/workbook.xml' || file.name === 'xl/_rels/workbook.xml.rels',
  )
  const workbookSheets = parseWorkbook(requiredXml(metadata, 'xl/workbook.xml'))
  if (workbookSheets.length === 0) throw new WorkbookError('Workbook has no worksheets')
  const relationships = parseRelationships(requiredXml(metadata, 'xl/_rels/workbook.xml.rels'))
  const sheets: SheetReference[] = workbookSheets.map((sheet) => {
    const path = relationships.get(sheet.relationId)
    if (!path || !path.startsWith('xl/worksheets/')) {
      throw new WorkbookError(`Worksheet relationship "${sheet.relationId}" is invalid`)
    }
    return { ...sheet, path }
  })
  const selected = requestedSheet
    ? sheets.find((sheet) => sheet.name === requestedSheet)
    : sheets[0]
  if (!selected) throw new WorkbookError(`Worksheet "${String(requestedSheet)}" was not found`)

  const contents = extractSelectedFiles(
    input,
    (file) => file.name === selected.path || file.name === 'xl/sharedStrings.xml',
  )
  const sharedStrings = parseSharedStrings(optionalXml(contents, 'xl/sharedStrings.xml'))
  const data = parseWorksheet(requiredXml(contents, selected.path), sharedStrings)

  return {
    sheet: selected.name,
    data,
    availableSheets: sheets.map((sheet) => sheet.name),
  }
}

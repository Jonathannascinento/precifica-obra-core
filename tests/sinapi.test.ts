import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  detectSinapiColumns,
  normalizeSinapiRows,
  parseBrazilianDecimal,
  parseSinapiWorkbook,
  ValidationError,
  WorkbookError,
} from '../src/index.js'

const config = {
  state: 'SP',
  referenceMonth: '2026-03',
  category: 'SINAPI_INSUMOS' as const,
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function columnName(index: number): string {
  let current = index + 1
  let output = ''

  while (current > 0) {
    const remainder = (current - 1) % 26
    output = String.fromCharCode(65 + remainder) + output
    current = Math.floor((current - 1) / 26)
  }

  return output
}

function buildXlsx(rows: string[][]): Uint8Array {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map(
          (value, columnIndex) =>
            `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`,
        )
        .join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Insumos" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  }

  return zipSync(files)
}

function buildSharedStringXlsx(): Uint8Array {
  const sharedStrings = [
    'Código',
    'Descrição',
    'Unidade',
    'Preço Desonerado',
    'Preço Não Desonerado',
    'Cimento & cal',
    'KG',
  ]
  const sharedStringsXml = sharedStrings
    .map((value) => `<si><t>${escapeXml(value)}</t></si>`)
    .join('')
  const headerCells = sharedStrings
    .slice(0, 5)
    .map((_, index) => `<c r="${columnName(index)}3" t="s"><v>${index}</v></c>`)
    .join('')

  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Cover" sheetId="1" r:id="rId1"/>' +
        '<sheet name="Shared" sheetId="2" r:id="rId2"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/>' +
        '</Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sharedStringsXml}</sst>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
    ),
    'xl/worksheets/sheet2.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Generated metadata</t></is></c></row>' +
        `<row r="3">${headerCells}</row>` +
        '<row r="4"><c r="A4"><v>101</v></c><c r="B4" t="s"><v>5</v></c>' +
        '<c r="C4" t="s"><v>6</v></c><c r="D4"><v>12.34565</v></c>' +
        '<c r="E4"><v>13.45675</v></c><c r="F4" t="b"><v>1</v></c></row>' +
        '</sheetData></worksheet>',
    ),
  })
}

describe('SINAPI decimal parsing and column detection', () => {
  it('parses Brazilian and plain decimals without binary floating-point loss', () => {
    expect(parseBrazilianDecimal('R$ 1.234,5678')?.toString()).toBe('1234.5678')
    expect(parseBrazilianDecimal('1234.5678')?.toString()).toBe('1234.5678')
    expect(parseBrazilianDecimal('-')).toBeNull()
    expect(parseBrazilianDecimal('-1,00')).toBeNull()
    expect(parseBrazilianDecimal('not-a-number')).toBeNull()
  })

  it('distinguishes desonerado from não desonerado columns', () => {
    expect(
      detectSinapiColumns([
        'Código SINAPI',
        'Descrição',
        'Unidade',
        'Preço Desonerado',
        'Preço Não Desonerado',
      ]),
    ).toEqual({
      code: 'Código SINAPI',
      description: 'Descrição',
      unit: 'Unidade',
      priceDesonerado: 'Preço Desonerado',
      priceNaoDesonerado: 'Preço Não Desonerado',
    })
  })
})

describe('normalizeSinapiRows', () => {
  it('normalizes rows, reports invalid input, and keeps the last duplicate', () => {
    const result = normalizeSinapiRows(
      [
        {
          Código: '123',
          Descrição: 'Cimento',
          Unidade: 'KG',
          Desonerado: '1,2345',
          'Não Desonerado': '1,3456',
        },
        {
          Código: 'ABC',
          Descrição: 'Invalid header-like row',
          Unidade: 'UN',
          Desonerado: '10,00',
          'Não Desonerado': '11,00',
        },
        {
          Código: '123',
          Descrição: 'Cimento atualizado',
          Unidade: 'KG',
          Desonerado: '1,2500',
          'Não Desonerado': '1,3600',
        },
      ],
      config,
    )

    expect(result.records).toEqual([
      {
        code: '123',
        originCode: '123',
        description: 'Cimento atualizado',
        unit: 'KG',
        state: 'SP',
        referenceMonth: '2026-03',
        category: 'INSUMO',
        priceDesonerado: '1.2500',
        priceNaoDesonerado: '1.3600',
        source: 'SINAPI',
      },
    ])
    expect(result.skippedRows).toBe(1)
    expect(result.duplicateRows).toBe(1)
    expect(result.diagnostics).toHaveLength(2)
  })

  it('supports keep-first and error duplicate strategies', () => {
    const rows = [
      { Código: '1', Descrição: 'First', Unidade: 'UN', Preço: '1,00' },
      { Código: '1', Descrição: 'Second', Unidade: 'UN', Preço: '2,00' },
    ]

    expect(
      normalizeSinapiRows(rows, { ...config, duplicateStrategy: 'keep-first' }).records[0]
        ?.description,
    ).toBe('First')
    expect(
      normalizeSinapiRows(rows, { ...config, duplicateStrategy: 'error' }).diagnostics[0]?.level,
    ).toBe('error')
  })

  it('validates UF, month, mapping, and price availability', () => {
    expect(() => normalizeSinapiRows([], { ...config, state: 'XX' })).toThrow(ValidationError)
    expect(() => normalizeSinapiRows([], { ...config, referenceMonth: '2026-13' })).toThrow(
      ValidationError,
    )
    expect(() =>
      normalizeSinapiRows([{ foo: 'bar' }], {
        ...config,
        mapping: { code: '', description: '', unit: '' },
      }),
    ).toThrow('Could not detect required code column')
  })

  it('maps every supported import category and custom source', () => {
    const rows = [{ Código: 1, Descrição: 'Item', Unidade: 'UN', Preço: 2 }]
    const cases = [
      ['SINAPI_COMPOSICOES', 'COMPOSICAO', 'SINAPI'],
      ['SINAPI_MO', 'MAO_DE_OBRA', 'SINAPI'],
      ['SINAPI_EQUIPAMENTOS', 'EQUIPAMENTO', 'SINAPI'],
      ['CUSTOM', 'INSUMO', 'CUSTOM'],
    ] as const

    for (const [category, expectedCategory, expectedSource] of cases) {
      expect(
        normalizeSinapiRows(rows, {
          state: 'rj',
          referenceMonth: '2025-12',
          category,
        }).records[0],
      ).toMatchObject({
        state: 'RJ',
        category: expectedCategory,
        source: expectedSource,
        priceDesonerado: null,
        priceNaoDesonerado: '2.0000',
      })
    }
  })

  it('diagnoses empty rows, missing metadata, and invalid prices', () => {
    const result = normalizeSinapiRows(
      [
        { Código: '', Descrição: '', Unidade: '', Preço: '' },
        { Código: '10', Descrição: '', Unidade: 'UN', Preço: '1,00' },
        { Código: '11', Descrição: 'No unit', Unidade: '', Preço: '1,00' },
        { Código: '12', Descrição: 'No price', Unidade: 'UN', Preço: 'invalid' },
      ],
      config,
    )

    expect(result.records).toEqual([])
    expect(result.skippedRows).toBe(4)
    expect(result.diagnostics.map((diagnostic) => diagnostic.field)).toEqual([
      'description',
      'unit',
      'price',
    ])
  })
})

describe('parseSinapiWorkbook', () => {
  it('parses a selected XLSX worksheet and returns diagnostics', async () => {
    const bytes = buildXlsx([
      ['Código', 'Descrição', 'Unidade', 'Preço Desonerado', 'Preço Não Desonerado'],
      ['94571', 'Janela de alumínio', 'M2', '550,1234', '575,4321'],
    ])

    const result = await parseSinapiWorkbook(bytes, { ...config, sheetName: 'Insumos' })

    expect(result.sheetName).toBe('Insumos')
    expect(result.availableSheets).toEqual(['Insumos'])
    expect(result.records[0]).toMatchObject({
      code: '94571',
      state: 'SP',
      priceDesonerado: '550.1234',
      priceNaoDesonerado: '575.4321',
    })
  })

  it('parses semicolon-delimited CSV with decimal commas', async () => {
    const csv = Buffer.from(
      'Código;Descrição;Unidade;Preço Desonerado;Preço Não Desonerado\n' +
        '88262;Carpinteiro;H;29,1234;31,4321\n',
      'utf8',
    )

    const result = await parseSinapiWorkbook(csv, { ...config, fileName: 'insumos.csv' })

    expect(result.sheetName).toBe('CSV')
    expect(result.records[0]).toMatchObject({
      code: '88262',
      description: 'Carpinteiro',
      priceDesonerado: '29.1234',
      priceNaoDesonerado: '31.4321',
    })
  })

  it('parses shared strings, metadata rows, sparse rows, and a selected second sheet', async () => {
    const result = await parseSinapiWorkbook(buildSharedStringXlsx(), {
      ...config,
      sheetName: 'Shared',
    })

    expect(result.availableSheets).toEqual(['Cover', 'Shared'])
    expect(result.records[0]).toMatchObject({
      code: '101',
      description: 'Cimento & cal',
      unit: 'KG',
      priceDesonerado: '12.3457',
      priceNaoDesonerado: '13.4568',
    })
  })

  it('accepts ArrayBuffer input and selects the first sheet by default', async () => {
    const bytes = buildXlsx([
      ['Código', 'Descrição', 'Unidade', 'Preço'],
      ['7', 'Areia', 'M3', '90.1234'],
    ])
    const arrayBuffer = Uint8Array.from(bytes).buffer
    const result = await parseSinapiWorkbook(arrayBuffer, config)

    expect(result.records[0]?.code).toBe('7')
  })

  it('rejects missing worksheets, legacy XLS, and invalid XLSX files', async () => {
    const bytes = buildXlsx([['Código']])

    await expect(parseSinapiWorkbook(bytes, { ...config, sheetName: 'Missing' })).rejects.toThrow(
      WorkbookError,
    )
    await expect(
      parseSinapiWorkbook(new Uint8Array([1, 2, 3]), { ...config, fileName: 'bad.xls' }),
    ).rejects.toThrow('Legacy .xls files are not supported')
    await expect(
      parseSinapiWorkbook(new Uint8Array([1, 2, 3]), { ...config, fileName: 'bad.xlsx' }),
    ).rejects.toThrow(WorkbookError)
  })
})

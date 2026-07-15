/** A decimal accepted at public API boundaries. Strings are recommended. */
export type DecimalInput = string | number

/** A normalized decimal serialized without exponential notation. */
export type DecimalString = string

export type SinapiCategory = 'INSUMO' | 'MAO_DE_OBRA' | 'EQUIPAMENTO' | 'COMPOSICAO'

export type SinapiImportCategory =
  'SINAPI_INSUMOS' | 'SINAPI_COMPOSICOES' | 'SINAPI_MO' | 'SINAPI_EQUIPAMENTOS' | 'CUSTOM'

export type CostCategory = 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'OTHER'

export interface SinapiReference {
  code: string
  description: string
  unit: string
  state: string
  referenceMonth: string
  category: SinapiCategory
  /** Price from the desonerado SINAPI column. */
  priceDesonerado: DecimalString | null
  /** Price from the não desonerado SINAPI column. */
  priceNaoDesonerado: DecimalString | null
  originCode?: string
  source: 'SINAPI' | 'CUSTOM'
}

export interface SinapiColumnMapping {
  code: string
  description: string
  unit: string
  priceDesonerado?: string
  priceNaoDesonerado?: string
}

export interface SinapiImportConfig {
  state: string
  /** Reference month in YYYY-MM format. */
  referenceMonth: string
  category: SinapiImportCategory
  mapping?: SinapiColumnMapping
  /** Defaults to keep-last, matching an upsert-oriented workflow. */
  duplicateStrategy?: 'keep-first' | 'keep-last' | 'error'
}

export interface ImportDiagnostic {
  level: 'warning' | 'error'
  row: number
  code?: string
  field?: string
  message: string
}

export interface NormalizeSinapiResult {
  records: SinapiReference[]
  diagnostics: ImportDiagnostic[]
  totalRows: number
  skippedRows: number
  duplicateRows: number
  mapping: SinapiColumnMapping
}

export interface ReadSinapiFileOptions {
  fileName?: string
  sheetName?: string
}

export interface ReadSinapiFileResult {
  headers: string[]
  rows: Array<Record<string, unknown>>
  sheetName: string
  availableSheets: string[]
}

export interface ParseSinapiWorkbookOptions extends SinapiImportConfig {
  fileName?: string
  sheetName?: string
}

export interface ParseSinapiWorkbookResult extends NormalizeSinapiResult {
  sheetName: string
  availableSheets: string[]
}

export interface LaborCharge {
  code: string
  description?: string
  percentage: DecimalInput
}

export interface CostItem {
  code: string
  description: string
  unit: string
  category: CostCategory
  coefficient: DecimalInput
  unitPrice: DecimalInput
  /** Applied only to LABOR items. */
  laborCharges?: LaborCharge[]
}

export interface MaterialCost extends CostItem {
  category: 'MATERIAL'
}

export interface LaborCost extends CostItem {
  category: 'LABOR'
  laborCharges?: LaborCharge[]
}

export interface EquipmentCost extends CostItem {
  category: 'EQUIPMENT'
  productive?: boolean
}

export interface Composition {
  code: string
  description: string
  unit: string
  items: CostItem[]
}

export interface CalculatedCostItem extends Omit<CostItem, 'coefficient' | 'unitPrice'> {
  coefficient: DecimalString
  unitPrice: DecimalString
  laborChargesPercentage: DecimalString
  effectiveUnitPrice: DecimalString
  total: DecimalString
}

export interface CompositionResult {
  code: string
  description: string
  unit: string
  items: CalculatedCostItem[]
  totalsByCategory: Record<CostCategory, DecimalString>
  directCost: DecimalString
}

export interface BdiParameters {
  administration: DecimalInput
  insurance: DecimalInput
  guarantees: DecimalInput
  risk: DecimalInput
  financialExpenses: DecimalInput
  taxes: DecimalInput
  profit: DecimalInput
}

export interface BdiResult {
  baseCost: DecimalString
  bdiRate: DecimalString
  bdiAmount: DecimalString
  finalPrice: DecimalString
}

export interface BudgetItem {
  code: string
  description: string
  unit: string
  quantity: DecimalInput
  unitPrice?: DecimalInput
  composition?: Composition
}

export interface BudgetInput {
  items: BudgetItem[]
  indirectCosts?: DecimalInput
  bdi?: BdiParameters
}

export interface CalculatedBudgetItem {
  code: string
  description: string
  unit: string
  quantity: DecimalString
  unitPrice: DecimalString
  total: DecimalString
  composition?: CompositionResult
}

export interface BudgetResult {
  items: CalculatedBudgetItem[]
  directCost: DecimalString
  indirectCosts: DecimalString
  baseCost: DecimalString
  bdiRate: DecimalString
  bdiAmount: DecimalString
  finalPrice: DecimalString
}

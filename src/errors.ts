export class PrecificaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'PrecificaError'
  }
}

export class ValidationError extends PrecificaError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class WorkbookError extends PrecificaError {
  constructor(message: string) {
    super(message, 'WORKBOOK_ERROR')
    this.name = 'WorkbookError'
  }
}

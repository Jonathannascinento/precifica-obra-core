declare module 'saxen' {
  type DecodeEntities = (value: string) => string
  type AttributeGetter = () => Record<string, string>
  type ContextGetter = () => { line: number; column: number; data: string }

  type OpenTagHandler = (
    elementName: string,
    attributeGetter: AttributeGetter,
    decodeEntities: DecodeEntities,
    selfClosing: boolean,
    contextGetter: ContextGetter,
  ) => void

  type CloseTagHandler = (
    elementName: string,
    decodeEntities: DecodeEntities,
    selfClosing: boolean,
    contextGetter: ContextGetter,
  ) => void

  type TextHandler = (
    value: string,
    decodeEntities: DecodeEntities,
    contextGetter: ContextGetter,
  ) => void

  type ErrorHandler = (error: Error, contextGetter: ContextGetter) => void

  export class Parser {
    constructor(options?: { proxy?: boolean })
    on(event: 'openTag', handler: OpenTagHandler): this
    on(event: 'closeTag', handler: CloseTagHandler): this
    on(event: 'text', handler: TextHandler): this
    on(event: 'cdata', handler: (value: string, contextGetter: ContextGetter) => void): this
    on(event: 'error', handler: ErrorHandler): this
    parse(xml: string): Error | undefined
  }
}

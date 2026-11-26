import { parseSync, visitorKeys, type Comment, type Node, type ObjectExpression, type Program } from 'oxc-parser'
import type { DiagnosticLocation } from './diagnostics'

export interface ParsedModule {
  file: string
  code: string
  program: Program
  comments: Comment[]
  locate: (offset: number) => DiagnosticLocation
  text: (node: Pick<Node, 'start' | 'end'>) => string
}

export interface ObjectLiteral {
  properties: Map<string, Node>
  hasSpread: boolean
}

export function parseModule(file: string, code: string): ParsedModule {
  const { program, comments } = parseSync(file, code)
  const lineStarts = [0]
  for (let index = code.indexOf('\n'); index !== -1; index = code.indexOf('\n', index + 1)) {
    lineStarts.push(index + 1)
  }
  return {
    file,
    code,
    program,
    comments,
    locate: (offset) => {
      let low = 0
      let high = lineStarts.length - 1
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if ((lineStarts[middle] ?? 0) <= offset) low = middle
        else high = middle - 1
      }
      return { file, line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 }
    },
    text: (node) => code.slice(node.start, node.end),
  }
}

export function walk(root: Node, visit: (node: Node) => void): void {
  visit(root)
  for (const key of visitorKeys[root.type] ?? []) {
    const child = (root as unknown as Record<string, unknown>)[key]
    for (const candidate of Array.isArray(child) ? child : [child]) {
      if (isNode(candidate)) walk(candidate, visit)
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

export function hasUseServerDirective(program: Program): boolean {
  return program.body.some((statement) => statement.type === 'ExpressionStatement' && statement.directive === 'use server')
}

export function staticString(node: Node | undefined | null): string | undefined {
  if (!node) return undefined
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '').join('')
  }
  return undefined
}

export function staticBoolean(node: Node | undefined | null): boolean | undefined {
  return node?.type === 'Literal' && typeof node.value === 'boolean' ? node.value : undefined
}

export function propertyName(node: Node, computed: boolean): string | undefined {
  if (!computed && node.type === 'Identifier') return node.name
  return staticString(node)
}

export function readObjectLiteral(node: ObjectExpression): ObjectLiteral {
  const properties = new Map<string, Node>()
  let hasSpread = false
  for (const property of node.properties) {
    if (property.type === 'SpreadElement') {
      hasSpread = true
      continue
    }
    const name = propertyName(property.key, property.computed)
    if (name !== undefined) properties.set(name, property.value)
  }
  return { properties, hasSpread }
}

export function calleeName(node: Node): string | undefined {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') return propertyName(node.property, node.computed)
  return undefined
}

export function collectCalleeNames(root: Node): Set<string> {
  const names = new Set<string>()
  walk(root, (node) => {
    if (node.type !== 'CallExpression') return
    const name = calleeName(node.callee)
    if (name !== undefined) names.add(name)
  })
  return names
}

export function collectReferencedNames(root: Node): Set<string> {
  const names = new Set<string>()
  walk(root, (node) => {
    if (node.type === 'Identifier') names.add(node.name)
    else if (node.type === 'Literal' && typeof node.value === 'string') names.add(node.value)
  })
  return names
}

export function collectObjectKeys(root: Node): Set<string> {
  const keys = new Set<string>()
  walk(root, (node) => {
    if (node.type !== 'Property' && node.type !== 'TSPropertySignature') return
    const name = propertyName(node.key, node.computed)
    if (name !== undefined) keys.add(name)
  })
  return keys
}

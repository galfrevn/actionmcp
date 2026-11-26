import type { CallExpression, Node } from 'oxc-parser'
import type { ToolAdapter } from '../core/types'
import { resolveAnnotations } from '../server/registry'
import { createDiagnostic, type Diagnostic, type DiagnosticCode } from './diagnostics'
import type { AnalyzedTool } from './model'
import { readToolOptions } from './options'
import { propertyName, walk, type ParsedModule } from './source'

export interface ToolReference {
  tool: AnalyzedTool
  exportName: string
}

export interface RegistryScan {
  tools: AnalyzedTool[]
  references: ToolReference[]
  diagnostics: Diagnostic[]
}

const SERVER_ENTRY = 'actionmcp/server'
const ADAPTERS: Record<string, ToolAdapter> = {
  fromFormDataAction: 'formdata',
  fromFormAction: 'form',
  fromSafeAction: 'safe-action',
}

export function scanRegistryModule(module: ParsedModule): RegistryScan {
  const scan: RegistryScan = { tools: [], references: [], diagnostics: [] }
  const imports = importedNames(module)
  const definition = findCall(module.program, imports, 'defineAgentTools')
  const [tools] = definition?.arguments ?? []
  if (tools?.type !== 'ObjectExpression') {
    scan.diagnostics.push(createDiagnostic('AT007', module.locate(definition?.start ?? 0), 'no defineAgentTools({ ... }) call with an object literal'))
    return scan
  }
  for (const property of tools.properties) {
    if (property.type === 'SpreadElement') {
      scan.diagnostics.push(createDiagnostic('AT007', module.locate(property.start), 'spread elements hide the registered tools'))
      continue
    }
    const key = propertyName(property.key, property.computed)
    if (key === undefined) {
      scan.diagnostics.push(createDiagnostic('AT007', module.locate(property.start), 'computed keys hide the tool name'))
      continue
    }
    addTool(module, scan, imports, key, property.value)
  }
  return scan
}

function addTool(module: ParsedModule, scan: RegistryScan, imports: Map<string, string>, key: string, value: Node): void {
  const line = module.locate(value.start).line
  if (value.type === 'Identifier') {
    const tool: AnalyzedTool = {
      name: key,
      kind: 'explicit',
      source: { file: module.file, export: value.name, line },
      description: '',
      schemaSource: 'standard-schema',
      annotations: resolveAnnotations(undefined, undefined, undefined),
      confirm: 'consequential',
      validated: true,
      diagnostics: [],
    }
    scan.tools.push(tool)
    scan.references.push({ tool, exportName: importedBindings(module).get(value.name) ?? value.name })
    return
  }
  if (!isCallTo(value, imports, 'tool')) {
    scan.diagnostics.push(createDiagnostic('AT007', module.locate(value.start), `"${key}" is not a tool(...) call`, key))
    return
  }
  const [action, options] = value.arguments
  const adapterName = action?.type === 'CallExpression' && action.callee.type === 'Identifier' ? imports.get(action.callee.name) : undefined
  const adapter = adapterName === undefined ? undefined : ADAPTERS[adapterName]
  const target = adapter && action?.type === 'CallExpression' ? action.arguments[0] : action
  const reading = readToolOptions(options, value.start)
  const annotations = resolveAnnotations(reading.readOnly, reading.consequential, reading.untrustedOutput)
  const tool: AnalyzedTool = {
    name: reading.name ?? key,
    kind: 'explicit',
    source: { file: module.file, export: target ? module.text(target) : key, line },
    description: reading.description ?? '',
    schemaSource: reading.input ? 'standard-schema' : 'none',
    annotations,
    confirm: reading.confirm ?? 'consequential',
    validated: false,
    diagnostics: [],
    ...(adapter ? { adapter } : {}),
    ...(reading.input ? { inputSource: module.text(reading.input) } : {}),
  }
  const report = (code: DiagnosticCode, offset: number, detail?: string) => {
    scan.diagnostics.push(createDiagnostic(code, module.locate(offset), detail, tool.name))
    if (!tool.diagnostics.includes(code)) tool.diagnostics.push(code)
  }
  for (const issue of reading.issues) report(issue.code, issue.offset, issue.detail)
  const descriptionLength = tool.description.trim().length
  if (descriptionLength > 0 && descriptionLength < 20) report('AT108', value.start, `"${tool.description.trim()}"`)
  if (tool.confirm === 'never' && annotations.consequentialHint) report('AT103', value.start)
  if (adapter && !reading.input) report('AT205', value.start)
  scan.tools.push(tool)
}

function importedNames(module: ParsedModule): Map<string, string> {
  const names = new Map<string, string>()
  for (const statement of module.program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== SERVER_ENTRY) continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
        names.set(specifier.local.name, specifier.imported.name)
      }
    }
  }
  return names
}

function importedBindings(module: ParsedModule): Map<string, string> {
  const bindings = new Map<string, string>()
  for (const statement of module.program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
        bindings.set(specifier.local.name, specifier.imported.name)
      }
    }
  }
  return bindings
}

function isCallTo(node: Node, imports: Map<string, string>, name: string): node is CallExpression {
  return node.type === 'CallExpression' && node.callee.type === 'Identifier' && imports.get(node.callee.name) === name
}

function findCall(root: Node, imports: Map<string, string>, name: string): CallExpression | undefined {
  let found: CallExpression | undefined
  walk(root, (node) => {
    if (!found && isCallTo(node, imports, name)) found = node
  })
  return found
}

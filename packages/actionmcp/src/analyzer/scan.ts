import type { ArrowFunctionExpression, CallExpression, Comment, Function as FunctionNode, Node, Statement } from 'oxc-parser'
import { resolveAnnotations } from '../server/registry'
import { createDiagnostic, type Diagnostic, type DiagnosticCode } from './diagnostics'
import { formDataAdapter, parseAgentTag, type AgentTag } from './jsdoc'
import type { AnalyzedTool } from './model'
import { readToolOptions } from './options'
import { collectCalleeNames, collectObjectKeys, collectReferencedNames, hasUseServerDirective, walk, type ParsedModule } from './source'

export interface ScanOptions {
  jsdoc: boolean
  auth: readonly string[]
}

export interface TypeRequest {
  tool: AnalyzedTool
  file: string
  parameterOffset: number
}

export interface ModuleScan {
  tools: AnalyzedTool[]
  typeRequests: TypeRequest[]
  diagnostics: Diagnostic[]
  usesNavigate: boolean
}

type AnyFunction = FunctionNode | ArrowFunctionExpression

interface ModuleContext {
  module: ParsedModule
  options: ScanOptions
  useServer: boolean
  agentNames: Set<string>
  namespaces: Set<string>
  componentNames: Set<string>
  declarations: Map<string, Node>
  exports: Map<string, string>
  scan: ModuleScan
}

const SERVER_ENTRY = 'actionmcp/server'
const COMPONENT_ENTRIES = ['actionmcp', 'actionmcp/client']
const MIN_DESCRIPTION_LENGTH = 20
const VALIDATION_CALL = /^(?:parse|safeParse|parseAsync|safeParseAsync|validate|assert\w*)$/
const FREE_FORM_STRING = /\bstring\s*\(|['"`]string\b/
const PERSONAL_FIELDS = new Set(['email', 'phone', 'address', 'birthdate', 'birthday', 'dob', 'ssn', 'passport'])

export function mayContainTools(code: string): boolean {
  return code.includes(SERVER_ENTRY) || code.includes('@agent') || code.includes('AgentTools')
}

export function scanModule(module: ParsedModule, options: ScanOptions): ModuleScan {
  const context: ModuleContext = {
    module,
    options,
    useServer: hasUseServerDirective(module.program),
    agentNames: new Set(),
    namespaces: new Set(),
    componentNames: new Set(),
    declarations: new Map(),
    exports: new Map(),
    scan: { tools: [], typeRequests: [], diagnostics: [], usesNavigate: false },
  }
  indexModule(context)
  scanAgentCalls(context)
  if (options.jsdoc) scanAgentTags(context)
  context.scan.usesNavigate = usesNavigate(context)
  return context.scan
}

function indexModule(context: ModuleContext): void {
  for (const statement of context.module.program.body) {
    if (statement.type === 'ImportDeclaration') {
      indexImport(context, statement)
    } else if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) {
        for (const name of indexDeclaration(context, statement.declaration)) context.exports.set(name, name)
      } else if (!statement.source) {
        for (const specifier of statement.specifiers) {
          if (specifier.local.type === 'Identifier' && specifier.exported.type === 'Identifier') {
            context.exports.set(specifier.local.name, specifier.exported.name)
          }
        }
      }
    } else if (statement.type === 'ExportDefaultDeclaration') {
      if (statement.declaration.type === 'Identifier') context.exports.set(statement.declaration.name, 'default')
    } else {
      indexDeclaration(context, statement)
    }
  }
}

function indexImport(context: ModuleContext, statement: Extract<Statement, { type: 'ImportDeclaration' }>): void {
  const source = statement.source.value
  for (const specifier of statement.specifiers) {
    if (source === SERVER_ENTRY) {
      if (specifier.type === 'ImportNamespaceSpecifier') context.namespaces.add(specifier.local.name)
      else if (specifier.type === 'ImportSpecifier' && importedName(specifier.imported) === 'agent') {
        context.agentNames.add(specifier.local.name)
      }
    } else if (COMPONENT_ENTRIES.includes(source)) {
      if (specifier.type === 'ImportSpecifier' && importedName(specifier.imported) === 'AgentTools') {
        context.componentNames.add(specifier.local.name)
      }
    }
  }
}

function importedName(node: Node): string | undefined {
  if (node.type === 'Identifier') return node.name
  return node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
}

function indexDeclaration(context: ModuleContext, node: Node): string[] {
  if (node.type === 'FunctionDeclaration' && node.id) {
    context.declarations.set(node.id.name, node)
    return [node.id.name]
  }
  if (node.type !== 'VariableDeclaration') return []
  const names: string[] = []
  for (const declarator of node.declarations) {
    if (declarator.id.type === 'Identifier' && declarator.init) {
      context.declarations.set(declarator.id.name, declarator.init)
      names.push(declarator.id.name)
    }
  }
  return names
}

function isAgentCall(context: ModuleContext, node: Node | null | undefined): node is CallExpression {
  if (node?.type !== 'CallExpression') return false
  const { callee } = node
  if (callee.type === 'Identifier') return context.agentNames.has(callee.name)
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    context.namespaces.has(callee.object.name) &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'agent'
  )
}

function scanAgentCalls(context: ModuleContext): void {
  const registered = new Set<Node>()
  for (const [localName, node] of context.declarations) {
    if (!isAgentCall(context, node)) continue
    registered.add(node)
    addAgentTool(context, node, context.exports.get(localName))
  }
  for (const statement of context.module.program.body) {
    if (statement.type === 'ExportDefaultDeclaration' && isAgentCall(context, statement.declaration)) {
      registered.add(statement.declaration)
      addAgentTool(context, statement.declaration, 'default')
    }
  }
  walk(context.module.program, (node) => {
    if (!isAgentCall(context, node) || registered.has(node)) return
    context.scan.diagnostics.push(createDiagnostic('AT109', context.module.locate(node.start)))
  })
}

function addAgentTool(context: ModuleContext, call: CallExpression, exportName: string | undefined): void {
  const { module } = context
  const reading = readToolOptions(call.arguments[0], call.start)
  const annotations = resolveAnnotations(reading.readOnly, reading.consequential, reading.untrustedOutput)
  const tool: AnalyzedTool = {
    name: reading.name ?? exportName ?? '',
    kind: 'agent',
    source: { file: module.file, export: exportName ?? '', line: module.locate(call.start).line },
    description: reading.description ?? '',
    schemaSource: reading.input ? 'standard-schema' : 'none',
    annotations,
    confirm: reading.confirm ?? 'consequential',
    validated: true,
    diagnostics: [],
    ...(reading.input ? { inputSource: module.text(reading.input) } : {}),
  }
  const report = reporter(context, tool)

  if (exportName === undefined) report('AT004', call.start, 'the agent() call is not exported')
  if (!context.useServer) report('AT004', call.start, "the file has no 'use server' directive")
  if (exportName === 'default' && reading.name === undefined) report('AT001', call.start, 'a default export needs the `name` option')
  for (const issue of reading.issues) report(issue.code, issue.offset, issue.detail)
  checkDescription(tool, report, call.start)
  if (tool.confirm === 'never' && annotations.consequentialHint) report('AT103', call.start)

  const handler = resolveFunction(context, call.arguments[1])
  if (handler) {
    checkAuthentication(context, handler, report)
    const input = resolveReference(context, reading.input)
    if (input) checkPersonalFields(collectObjectKeys(input), handler, report, input.start)
  }
  const output = resolveReference(context, reading.output)
  if (output && !annotations.untrustedContentHint && FREE_FORM_STRING.test(module.text(output))) {
    report('AT106', output.start)
  }
  context.scan.tools.push(tool)
}

function scanAgentTags(context: ModuleContext): void {
  for (const comment of context.module.comments) {
    if (comment.type !== 'Block' || !comment.value.startsWith('*')) continue
    const tag = parseAgentTag(comment.value)
    if (tag) addJsdocTool(context, comment, tag)
  }
}

function addJsdocTool(context: ModuleContext, comment: Comment, tag: AgentTag): void {
  const { module } = context
  const target = documentedFunction(context, comment)
  const exportName = target?.exportName
  const annotations = resolveAnnotations(tag.readOnly || undefined, tag.consequential || undefined, tag.untrustedOutput || undefined)
  const tool: AnalyzedTool = {
    name: tag.name ?? (exportName === 'default' ? target?.localName : exportName) ?? target?.localName ?? '',
    kind: 'jsdoc',
    source: { file: module.file, export: exportName ?? '', line: module.locate(target?.node.start ?? comment.start).line },
    description: tag.description,
    schemaSource: 'none',
    annotations,
    confirm: 'consequential',
    validated: false,
    diagnostics: [],
  }
  const report = reporter(context, tool)
  const offset = target?.node.start ?? comment.start

  if (!target) report('AT004', offset, '@agent is not attached to a function')
  else if (exportName === undefined) report('AT004', offset, 'the function is not exported')
  if (!context.useServer) report('AT004', offset, "the file has no 'use server' directive")
  for (const modifier of tag.unknownModifiers) report('AT006', comment.start, `"${modifier}"`)
  if (tag.description === '') report('AT003', comment.start, 'the JSDoc comment has no description')
  checkDescription(tool, report, comment.start)

  if (target && exportName !== undefined) {
    const { params } = target.node
    const [first] = params
    if (tag.formData || params.some(isFormDataParameter)) {
      tool.adapter = formDataAdapter(params.length)
      report('AT101', offset, 'a FormData parameter has no inferable schema; use defineAgentTools() with an input schema')
    } else if (first && !hasTypeAnnotation(first)) {
      report('AT101', first.start, 'the first parameter has no type annotation')
    } else if (first) {
      tool.schemaSource = 'typescript'
      context.scan.typeRequests.push({ tool, file: module.file, parameterOffset: first.start })
    }
    if (first && target.node.body) {
      const calls = collectCalleeNames(target.node.body)
      if (![...calls].some((name) => VALIDATION_CALL.test(name))) report('AT102', offset)
    }
    checkAuthentication(context, target.node, report)
    if (first) checkPersonalFields(collectObjectKeys(first), target.node, report, first.start)
  }
  context.scan.tools.push(tool)
}

interface DocumentedFunction {
  node: AnyFunction
  localName: string | undefined
  exportName: string | undefined
}

function documentedFunction(context: ModuleContext, comment: Comment): DocumentedFunction | undefined {
  const { module } = context
  const statement = module.program.body.find(
    (candidate) => candidate.start >= comment.end && module.code.slice(comment.end, candidate.start).trim() === '',
  )
  if (!statement) return undefined
  if (statement.type === 'ExportDefaultDeclaration') {
    const node = asFunction(statement.declaration)
    return node ? { node, localName: functionName(node), exportName: 'default' } : undefined
  }
  const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  if (!declaration) return undefined
  const localName = declaredName(declaration)
  const node = asFunction(declaration.type === 'VariableDeclaration' ? declaration.declarations[0]?.init : declaration)
  if (!node || localName === undefined) return undefined
  return { node, localName, exportName: context.exports.get(localName) }
}

function declaredName(node: Node): string | undefined {
  if (node.type === 'FunctionDeclaration') return node.id?.name
  if (node.type !== 'VariableDeclaration') return undefined
  const id = node.declarations[0]?.id
  return id?.type === 'Identifier' ? id.name : undefined
}

function functionName(node: AnyFunction): string | undefined {
  return node.type === 'ArrowFunctionExpression' ? undefined : node.id?.name
}

function asFunction(node: Node | null | undefined): AnyFunction | undefined {
  if (!node) return undefined
  const isFunction = node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'
  return isFunction ? (node as AnyFunction) : undefined
}

function resolveReference(context: ModuleContext, node: Node | undefined): Node | undefined {
  return node?.type === 'Identifier' ? context.declarations.get(node.name) : node
}

function resolveFunction(context: ModuleContext, node: Node | undefined): AnyFunction | undefined {
  return asFunction(resolveReference(context, node))
}

function isFormDataParameter(parameter: Node): boolean {
  const annotation = typeAnnotationOf(parameter)
  return annotation?.type === 'TSTypeReference' && annotation.typeName.type === 'Identifier' && annotation.typeName.name === 'FormData'
}

function hasTypeAnnotation(parameter: Node): boolean {
  return typeAnnotationOf(parameter) !== undefined
}

function typeAnnotationOf(parameter: Node): Node | undefined {
  const target = parameter.type === 'AssignmentPattern' ? parameter.left : parameter
  const annotation = (target as { typeAnnotation?: { typeAnnotation?: Node } | null }).typeAnnotation
  return annotation?.typeAnnotation ?? undefined
}

type Report = (code: DiagnosticCode, offset: number, detail?: string) => void

function reporter(context: ModuleContext, tool: AnalyzedTool): Report {
  return (code, offset, detail) => {
    context.scan.diagnostics.push(createDiagnostic(code, context.module.locate(offset), detail, tool.name || undefined))
    if (!tool.diagnostics.includes(code)) tool.diagnostics.push(code)
  }
}

function checkDescription(tool: AnalyzedTool, report: Report, offset: number): void {
  const length = tool.description.trim().length
  if (length > 0 && length < MIN_DESCRIPTION_LENGTH) report('AT108', offset, `"${tool.description.trim()}"`)
}

function checkAuthentication(context: ModuleContext, handler: AnyFunction, report: Report): void {
  if (!handler.body) return
  const calls = collectCalleeNames(handler.body)
  if (!context.options.auth.some((name) => calls.has(name))) report('AT105', handler.start)
}

function checkPersonalFields(keys: Set<string>, handler: AnyFunction, report: Report, offset: number): void {
  if (!handler.body) return
  const referenced = collectReferencedNames(handler.body)
  const unused = [...keys].filter((key) => isPersonalField(key) && !referenced.has(key))
  if (unused.length > 0) report('AT107', offset, unused.join(', '))
}

function isPersonalField(key: string): boolean {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_-]+/)
  return words.some((word) => PERSONAL_FIELDS.has(word.toLowerCase()))
}

function usesNavigate(context: ModuleContext): boolean {
  if (context.componentNames.size === 0) return false
  let found = false
  walk(context.module.program, (node) => {
    if (node.type !== 'JSXOpeningElement') return
    if (node.name.type !== 'JSXIdentifier' || !context.componentNames.has(node.name.name)) return
    for (const attribute of node.attributes) {
      if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier' || attribute.name.name !== 'navigate') continue
      const value = attribute.value
      const disabled = value?.type === 'JSXExpressionContainer' && value.expression.type === 'Literal' && value.expression.value === false
      if (!disabled) found = true
    }
  })
  return found
}

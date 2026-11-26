import { describe, expect, it } from 'vitest'
import { formDataAdapter, parseAgentTag } from './jsdoc'

function comment(...lines: string[]): string {
  return `*\n${lines.map((line) => ` * ${line}`).join('\n')}\n `
}

describe('parseAgentTag', () => {
  it('returns nothing without the tag', () => {
    expect(parseAgentTag(comment('Rename the project.', '@param input The input'))).toBeUndefined()
    expect(parseAgentTag(comment('Contact agent@example.com for help.'))).toBeUndefined()
    expect(parseAgentTag(comment('@agentic is another tag'))).toBeUndefined()
  })

  it('reads the description before the first tag', () => {
    const tag = parseAgentTag(comment('Rename the current project.', 'Returns the new name.', '@param input The input', '@agent'))
    expect(tag).toEqual({
      description: 'Rename the current project. Returns the new name.',
      readOnly: false,
      consequential: false,
      untrustedOutput: false,
      formData: false,
      unknownModifiers: [],
    })
  })

  it.each([
    ['@agent', {}],
    ['@agent readonly', { readOnly: true }],
    ['@agent consequential', { consequential: true }],
    ['@agent untrusted-output', { untrustedOutput: true }],
    ['@agent name=project.rename', { name: 'project.rename' }],
    ['@agent formdata', { formData: true }],
    ['@agent readonly untrusted-output name=todos.list', { readOnly: true, untrustedOutput: true, name: 'todos.list' }],
  ])('parses %s', (line, expected) => {
    expect(parseAgentTag(comment('List the todos.', line))).toMatchObject({
      description: 'List the todos.',
      unknownModifiers: [],
      ...expected,
    })
  })

  it('collects unknown modifiers', () => {
    expect(parseAgentTag(comment('List the todos.', '@agent readonly expose-all'))?.unknownModifiers).toEqual(['expose-all'])
  })

  it('parses a single-line comment', () => {
    expect(parseAgentTag('* Rename the project. @agent consequential ')).toMatchObject({
      description: 'Rename the project.',
      consequential: true,
    })
  })

  it('returns an empty description when the comment has only the tag', () => {
    expect(parseAgentTag(comment('@agent'))?.description).toBe('')
  })
})

describe('formDataAdapter', () => {
  it('maps the parameter count to the adapter', () => {
    expect(formDataAdapter(1)).toBe('form')
    expect(formDataAdapter(2)).toBe('formdata')
  })
})

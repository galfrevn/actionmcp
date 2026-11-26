import { describe, expect, it } from 'vitest'
import {
  RESERVED_TOOL_NAMES,
  applyPrefix,
  checkToolNames,
  describeNameIssue,
  isReservedToolName,
  isValidToolName,
} from './names'

describe('isValidToolName', () => {
  it.each(['a', 'addTodo', 'team.inviteMember', 'get_cart', 'x-1', 'A'.repeat(128)])('accepts %s', (name) => {
    expect(isValidToolName(name)).toBe(true)
  })

  it.each(['', 'A'.repeat(129), 'add todo', 'añadir', 'a/b', 'a:b', 'tool!', ' a'])('rejects %j', (name) => {
    expect(isValidToolName(name)).toBe(false)
  })
})

describe('isReservedToolName', () => {
  it.each([...RESERVED_TOOL_NAMES])('reserves %s', (name) => {
    expect(isReservedToolName(name)).toBe(true)
  })

  it('does not reserve application names', () => {
    expect(isReservedToolName('addTodo')).toBe(false)
  })
})

describe('applyPrefix', () => {
  it('prepends the prefix', () => {
    expect(applyPrefix('addTodo', 'acme.')).toBe('acme.addTodo')
  })

  it('returns the name when there is no prefix', () => {
    expect(applyPrefix('addTodo', undefined)).toBe('addTodo')
  })
})

describe('checkToolNames', () => {
  it('reports nothing for valid, unique names', () => {
    expect(checkToolNames(['addTodo', 'listTodos'])).toEqual([])
  })

  it('reports AT001 for an invalid name', () => {
    expect(checkToolNames(['add todo'])).toEqual([{ code: 'AT001', name: 'add todo', reason: 'invalid' }])
  })

  it('reports AT002 for a reserved name', () => {
    expect(checkToolNames(['snapshot'])).toEqual([{ code: 'AT002', name: 'snapshot', reason: 'reserved' }])
  })

  it('reports AT002 for a duplicate name', () => {
    expect(checkToolNames(['addTodo', 'addTodo'])).toEqual([{ code: 'AT002', name: 'addTodo', reason: 'duplicate' }])
  })

  it('accepts a reserved name once it has a prefix', () => {
    expect(checkToolNames([applyPrefix('snapshot', 'acme.')])).toEqual([])
  })
})

describe('describeNameIssue', () => {
  it.each([
    ['invalid', 'Invalid tool name'],
    ['reserved', 'is reserved'],
    ['duplicate', 'more than once'],
  ] as const)('explains a %s name', (reason, expected) => {
    expect(describeNameIssue({ code: 'AT002', name: 'x', reason })).toContain(expected)
  })
})

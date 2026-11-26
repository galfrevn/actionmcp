import { describe, expect, it } from 'vitest'
import { createMatcher, createSelector } from './match'

describe('createMatcher', () => {
  it('matches exact values', () => {
    const matches = createMatcher(['addTodo'])
    expect(matches('addTodo')).toBe(true)
    expect(matches('addTodos')).toBe(false)
  })

  it('treats * as a wildcard inside one segment', () => {
    const matches = createMatcher(['team.*', '/projects/*'])
    expect(matches('team.inviteMember')).toBe(true)
    expect(matches('account.delete')).toBe(false)
    expect(matches('/projects/[id]')).toBe(true)
    expect(matches('/projects/[id]/settings')).toBe(false)
  })

  it('treats ** as a wildcard across segments', () => {
    const matches = createMatcher(['/projects/**'])
    expect(matches('/projects/[id]/settings')).toBe(true)
    expect(matches('/teams')).toBe(false)
  })

  it('treats brackets and dots as literals', () => {
    const matches = createMatcher(['/posts/[slug]', 'a.b'])
    expect(matches('/posts/[slug]')).toBe(true)
    expect(matches('/posts/s')).toBe(false)
    expect(matches('axb')).toBe(false)
  })

  it('matches nothing without patterns', () => {
    expect(createMatcher([])('anything')).toBe(false)
  })
})

describe('createSelector', () => {
  it('selects everything by default', () => {
    expect(createSelector({})('addTodo')).toBe(true)
  })

  it('keeps only included values', () => {
    const isSelected = createSelector({ include: ['team.*'] })
    expect(isSelected('team.listMembers')).toBe(true)
    expect(isSelected('account.update')).toBe(false)
  })

  it('removes excluded values after include', () => {
    const isSelected = createSelector({ include: ['team.*'], exclude: ['team.removeMember'] })
    expect(isSelected('team.listMembers')).toBe(true)
    expect(isSelected('team.removeMember')).toBe(false)
  })
})

const SPECIAL_CHARACTERS = /[.+?^${}()|[\]\\]/g

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('**')
    .map((part) => part.split('*').map((literal) => literal.replace(SPECIAL_CHARACTERS, '\\$&')).join('[^/]*'))
    .join('.*')
  return new RegExp(`^${source}$`)
}

export function createMatcher(patterns: readonly string[]): (value: string) => boolean {
  const expressions = patterns.map(patternToRegExp)
  return (value) => expressions.some((expression) => expression.test(value))
}

export interface SelectOptions {
  include?: readonly string[] | undefined
  exclude?: readonly string[] | undefined
}

export function createSelector({ include, exclude }: SelectOptions): (value: string) => boolean {
  const isIncluded = include ? createMatcher(include) : () => true
  const isExcluded = exclude ? createMatcher(exclude) : () => false
  return (value) => isIncluded(value) && !isExcluded(value)
}

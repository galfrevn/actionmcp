import { toStandardJsonSchema } from '@valibot/to-json-schema'
import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { convertSchema, isStandardSchema, sanitizeJsonSchema, validateWithSchema } from './schema'

function withoutDialect(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = schema
  return rest
}

const cartSchemas = {
  addToCart: z.object({ productId: z.string().describe('Product identifier'), quantity: z.number().int().min(1).default(1) }),
  removeFromCart: z.object({ productId: z.string() }),
  setQuantity: z.object({ productId: z.string(), quantity: z.number().int().min(0).max(99) }),
  applyCoupon: z.object({ code: z.string().min(3).max(32), scope: z.enum(['cart', 'shipping']).optional() }),
}

describe('isStandardSchema', () => {
  it('accepts Zod, Valibot, and ArkType schemas', () => {
    expect(isStandardSchema(z.string())).toBe(true)
    expect(isStandardSchema(v.string())).toBe(true)
    expect(isStandardSchema(type('string'))).toBe(true)
  })

  it.each([null, undefined, 'schema', {}, { '~standard': 'x' }])('rejects %j', (value) => {
    expect(isStandardSchema(value)).toBe(false)
  })
})

describe('convertSchema', () => {
  it.each(Object.entries(cartSchemas))('matches z.toJSONSchema for %s', (_name, schema) => {
    expect(convertSchema(schema)).toEqual({ ok: true, schema: withoutDialect(z.toJSONSchema(schema, { io: 'input' })) })
  })

  it('converts a Zod schema to draft 2020-12 without the dialect key', () => {
    const schema = z.object({ text: z.string().min(1).max(200).describe('Todo text') })
    expect(convertSchema(schema)).toEqual({
      ok: true,
      schema: {
        type: 'object',
        properties: { text: { type: 'string', minLength: 1, maxLength: 200, description: 'Todo text' } },
        required: ['text'],
      },
    })
  })

  it('converts a Valibot schema wrapped with toStandardJsonSchema', () => {
    const schema = toStandardJsonSchema(v.object({ email: v.pipe(v.string(), v.email()), role: v.picklist(['admin', 'member']) }))
    const conversion = convertSchema(schema)
    expect(conversion).toMatchObject({
      ok: true,
      schema: {
        type: 'object',
        properties: { email: { type: 'string', format: 'email' }, role: { enum: ['admin', 'member'] } },
        required: ['email', 'role'],
      },
    })
    expect(conversion.ok && '$schema' in conversion.schema).toBe(false)
  })

  it('converts an ArkType schema', () => {
    const conversion = convertSchema(type({ name: 'string', 'age?': 'number' }))
    expect(conversion).toMatchObject({
      ok: true,
      schema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } }, required: ['name'] },
    })
  })

  it('reports a validator without Standard JSON Schema', () => {
    expect(convertSchema(v.object({ text: v.string() }))).toEqual({
      ok: false,
      reason: 'The validator does not implement Standard JSON Schema.',
    })
  })

  it('reports an input schema that is not an object', () => {
    expect(convertSchema(z.string())).toEqual({ ok: false, reason: 'A tool input schema must describe an object.' })
  })

  it('accepts a union of objects at the root and marks it as an object', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('email'), to: z.string() }),
      z.object({ kind: z.literal('sms'), phone: z.string() }),
    ])
    const conversion = convertSchema(schema)
    expect(conversion).toMatchObject({ ok: true, schema: { type: 'object', oneOf: [{ type: 'object' }, { type: 'object' }] } })
    expect(convertSchema(z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]))).toMatchObject({
      ok: true,
      schema: { type: 'object' },
    })
  })

  it('reports a root union with a branch that is not an object', () => {
    expect(convertSchema(z.union([z.object({ a: z.string() }), z.string()]))).toEqual({
      ok: false,
      reason: 'A tool input schema must describe an object.',
    })
  })

  it('allows an output schema that is not an object', () => {
    expect(convertSchema(z.array(z.string()), 'output')).toEqual({
      ok: true,
      schema: { type: 'array', items: { type: 'string' } },
    })
  })

  it('uses the output side of a transforming schema', () => {
    const schema = z.object({ count: z.string().transform(Number).pipe(z.number()) })
    expect(convertSchema(schema, 'input')).toMatchObject({ ok: true, schema: { properties: { count: { type: 'string' } } } })
    expect(convertSchema(schema, 'output')).toMatchObject({ ok: true, schema: { properties: { count: { type: 'number' } } } })
  })

  it('reports a conversion that throws', () => {
    const schema = z.object({ at: z.string() })
    const throwing = {
      '~standard': {
        ...schema['~standard'],
        jsonSchema: {
          input: () => {
            throw new Error('boom')
          },
          output: () => ({}),
        },
      },
    }
    expect(convertSchema(throwing as never)).toEqual({ ok: false, reason: 'boom' })
  })

  it('describes a coerced Zod date in the input and any Zod date in the output as a date-time string', () => {
    const input = z.object({ title: z.string(), due: z.coerce.date() })
    expect(convertSchema(input)).toEqual({
      ok: true,
      schema: {
        type: 'object',
        properties: { title: { type: 'string' }, due: { type: 'string', format: 'date-time' } },
        required: ['title', 'due'],
      },
    })
    const output = z.object({ id: z.string(), createdAt: z.date() })
    expect(convertSchema(output, 'output')).toMatchObject({
      ok: true,
      schema: { properties: { createdAt: { type: 'string', format: 'date-time' } } },
    })
  })

  it('explains that an agent cannot send a Zod date that is not coerced', () => {
    expect(convertSchema(z.object({ due: z.date() }))).toEqual({
      ok: false,
      reason: 'A z.date() field cannot come from an agent, because a tool input is JSON. Use z.coerce.date().',
    })
  })

  it.each([
    ['bigint', z.object({ amount: z.bigint() })],
    ['custom', z.object({ file: z.custom<File>() })],
    ['map', z.object({ tags: z.map(z.string(), z.string()) })],
  ])('still reports a Zod %s field that JSON Schema cannot represent', (kind, schema) => {
    expect(convertSchema(schema)).toEqual({ ok: false, reason: `The Zod type "${kind}" cannot be represented in JSON Schema.` })
  })

  it('passes library options only to Zod', () => {
    const calls: unknown[] = []
    const record = (options: unknown) => {
      calls.push(options)
      return { type: 'object' }
    }
    const fake = (vendor: string) => ({
      '~standard': { version: 1, vendor, validate: () => ({ value: {} }), jsonSchema: { input: record, output: record } },
    })
    convertSchema(fake('arktype') as never)
    convertSchema(fake('zod') as never)
    expect(calls[0]).toEqual({ target: 'draft-2020-12' })
    expect(calls[1]).toMatchObject({ target: 'draft-2020-12', libraryOptions: { unrepresentable: 'any' } })
  })
})

describe('sanitizeJsonSchema', () => {
  it('removes the dialect key at every level', () => {
    const schema = { $schema: 'x', type: 'object', properties: { a: { $schema: 'y', type: 'string' } } }
    expect(sanitizeJsonSchema(schema)).toEqual({ type: 'object', properties: { a: { type: 'string' } } })
  })

  it('trims descriptions and drops empty ones', () => {
    const schema = { type: 'object', description: '  Create a todo.  ', properties: { a: { type: 'string', description: '   ' } } }
    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      description: 'Create a todo.',
      properties: { a: { type: 'string' } },
    })
  })

  it('keeps a property that is named description', () => {
    const schema = { type: 'object', properties: { description: { type: 'string' } } }
    expect(sanitizeJsonSchema(schema)).toEqual(schema)
  })

  it('inlines acyclic definitions and removes $defs', () => {
    const schema = {
      type: 'object',
      properties: { owner: { $ref: '#/$defs/User', description: 'Owner' }, members: { type: 'array', items: { $ref: '#/$defs/User' } } },
      $defs: { User: { type: 'object', properties: { role: { $ref: '#/$defs/Role' } } }, Role: { enum: ['admin', 'member'] } },
    }
    const user = { type: 'object', properties: { role: { enum: ['admin', 'member'] } } }
    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: { owner: { ...user, description: 'Owner' }, members: { type: 'array', items: user } },
    })
  })

  it('keeps $defs when a definition is recursive', () => {
    const schema = {
      type: 'object',
      properties: { root: { $ref: '#/$defs/Node' } },
      $defs: { Node: { type: 'object', properties: { children: { type: 'array', items: { $ref: '#/$defs/Node' } } } } },
    }
    expect(sanitizeJsonSchema(schema)).toEqual(schema)
  })

  it('leaves references that do not point at $defs', () => {
    const schema = { type: 'object', properties: { self: { $ref: '#' }, other: { $ref: '#/$defs/Missing' } } }
    expect(sanitizeJsonSchema(schema)).toEqual(schema)
  })
})

describe('validateWithSchema', () => {
  const schema = z.object({ text: z.string().min(1), tags: z.array(z.string()).default([]) })

  it('returns the parsed value', async () => {
    await expect(validateWithSchema(schema, { text: 'Buy milk' })).resolves.toEqual({
      ok: true,
      value: { text: 'Buy milk', tags: [] },
    })
  })

  it('returns issues with a JSON-safe path', async () => {
    const outcome = await validateWithSchema(schema, { text: '', tags: ['a', 1] })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok ? [] : outcome.issues.map((issue) => issue.path)).toEqual([['text'], ['tags', 1]])
    expect(outcome.ok ? [] : outcome.issues.every((issue) => typeof issue.message === 'string')).toBe(true)
  })

  it('validates with Valibot and ArkType', async () => {
    await expect(validateWithSchema(v.object({ n: v.number() }), { n: 'x' })).resolves.toMatchObject({ ok: false })
    await expect(validateWithSchema(type({ n: 'number' }), { n: 1 })).resolves.toEqual({ ok: true, value: { n: 1 } })
  })

  it('reads the key of object path segments', async () => {
    const custom = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'Bad', path: [{ key: 'items' }, 0, Symbol('s')] }] }),
      },
    }
    await expect(validateWithSchema(custom, {})).resolves.toEqual({
      ok: false,
      issues: [{ message: 'Bad', path: ['items', 0, 'Symbol(s)'] }],
    })
  })
})

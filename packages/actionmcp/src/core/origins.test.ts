import { describe, expect, it } from 'vitest'
import { isTrustworthyOrigin } from './origins'

describe('isTrustworthyOrigin', () => {
  it.each([
    'https://agent.example',
    'https://agent.example:8443',
    'wss://agent.example',
    'http://localhost:3001',
    'http://app.localhost',
    'http://127.0.0.1:4000',
    'http://127.12.0.3',
    'http://127.1:4000',
    'http://[::1]:3000',
  ])('accepts %s', (origin) => {
    expect(isTrustworthyOrigin(origin)).toBe(true)
  })

  it.each([
    'agent.example',
    'http://agent.example',
    'http://192.168.1.20:3000',
    'http://127.example.com',
    'http://127.0.0.1.example.com',
    'ftp://agent.example',
    'data:text/plain,x',
    '',
    'https://',
  ])('rejects %j', (origin) => {
    expect(isTrustworthyOrigin(origin)).toBe(false)
  })
})

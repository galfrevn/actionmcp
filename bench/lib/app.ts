import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSeed, type Database } from '../app/lib/seed.ts'

export const APP_DIRECTORY = fileURLToPath(new URL('../app', import.meta.url))
export const DATABASE_FILE = fileURLToPath(new URL('../app/.data/db.json', import.meta.url))
export const APP_PORT = 4400
export const APP_URL = `http://localhost:${APP_PORT}`

export function resetDatabase(): Database {
  const seed = createSeed()
  mkdirSync(dirname(DATABASE_FILE), { recursive: true })
  writeFileSync(DATABASE_FILE, `${JSON.stringify(seed, null, 2)}\n`)
  return seed
}

export function readDatabase(): Database {
  return JSON.parse(readFileSync(DATABASE_FILE, 'utf8')) as Database
}

export async function startApp(): Promise<ChildProcess> {
  resetDatabase()
  const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(APP_PORT)], {
    cwd: APP_DIRECTORY,
    stdio: 'ignore',
    env: { ...process.env, BENCH_AUTO_CONFIRM: '1', NEXT_TELEMETRY_DISABLED: '1' },
  })
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(APP_URL).catch(() => undefined)
    if (response?.ok) return server
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  server.kill()
  throw new Error(`The demo app did not start on ${APP_URL}. Run "pnpm --filter bench-app build" first.`)
}

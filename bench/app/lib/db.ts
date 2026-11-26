import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createSeed, type Database } from './seed'

const DATABASE_FILE = join(process.cwd(), '.data', 'db.json')

export function readDatabase(): Database {
  if (!existsSync(DATABASE_FILE)) {
    writeDatabase(createSeed())
  }
  return JSON.parse(readFileSync(DATABASE_FILE, 'utf8')) as Database
}

export function writeDatabase(database: Database): void {
  mkdirSync(dirname(DATABASE_FILE), { recursive: true })
  writeFileSync(DATABASE_FILE, `${JSON.stringify(database, null, 2)}\n`)
}

export function updateDatabase(change: (database: Database) => void): Database {
  const database = readDatabase()
  change(database)
  writeDatabase(database)
  return database
}

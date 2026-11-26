import { readDatabase } from './db'

export async function getSession(): Promise<{ account: string }> {
  return { account: readDatabase().account.name }
}

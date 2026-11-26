'use server'

import { revalidatePath } from 'next/cache'
import { endDemo, startDemo } from '../lib/todos'

export async function start(): Promise<void> {
  await startDemo()
  revalidatePath('/', 'layout')
}

export async function reset(): Promise<void> {
  await endDemo()
  revalidatePath('/', 'layout')
}

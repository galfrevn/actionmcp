'use server'

import { revalidatePath } from 'next/cache'
import { endSession, startSession } from '../lib/session'

export async function signIn(): Promise<void> {
  await startSession('demo')
  revalidatePath('/', 'layout')
}

export async function signOut(): Promise<void> {
  await endSession()
  revalidatePath('/', 'layout')
}

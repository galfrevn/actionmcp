'use server'

import { agent } from 'actionmcp/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { store } from '../lib/store'

export const listComments = agent(
  {
    description: 'List the public comments on the account page. Returns user-generated text.',
    readOnly: true,
    untrustedOutput: true,
    output: z.array(z.string()),
  },
  async () => store.comments,
)

export const deleteAccount = agent(
  { description: 'Permanently delete the signed-in account. This cannot be undone.' },
  async () => {
    store.accountDeleted = true
    revalidatePath('/')
    return { deleted: true }
  },
)

export const restoreAccount = agent(
  { description: 'Restore the account of this fixture so that tests can run again.', confirm: 'always' },
  async () => {
    store.accountDeleted = false
    revalidatePath('/')
    return { deleted: false }
  },
)

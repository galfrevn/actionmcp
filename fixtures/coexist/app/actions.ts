'use server'

import { agent } from 'actionmcp/server'

export const getProfile = agent(
  { description: 'Read the profile of the signed-in user. Returns the display name.', readOnly: true },
  async () => ({ name: 'Ana' }),
)

export const getCart = agent(
  { description: 'Read the cart of the signed-in user. Returns the item count.', readOnly: true, name: 'get_cart' },
  async () => ({ items: 2 }),
)

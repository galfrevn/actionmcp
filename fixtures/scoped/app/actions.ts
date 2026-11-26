'use server'

import { agent } from 'actionmcp/server'

export const ping = agent({ description: 'Check that the app responds. Returns the server time.', readOnly: true }, async () => ({
  time: new Date().toISOString(),
}))

export const alphaRead = agent(
  { description: 'Read the alpha section. Returns its title.', readOnly: true, name: 'alpha.read' },
  async () => ({ title: 'Alpha' }),
)

export const alphaWrite = agent({ description: 'Update the alpha section. Returns the new title.', name: 'alpha.write' }, async () => ({
  title: 'Alpha updated',
}))

export const betaRead = agent(
  { description: 'Read the beta section. Returns its title.', readOnly: true, name: 'beta.read' },
  async () => ({ title: 'Beta' }),
)

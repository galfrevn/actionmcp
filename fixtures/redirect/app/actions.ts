'use server'

import { agent } from 'actionmcp/server'
import { redirect } from 'next/navigation'

export const finishOnboarding = agent(
  { description: 'Finish the onboarding and open the summary page. Returns the new location.', confirm: 'always' },
  async () => {
    redirect('/done?from=root')
  },
)

export const leaveStart = agent(
  { description: 'Leave the start section and open the summary page. Returns the new location.', readOnly: true },
  async () => {
    redirect('/done?from=start')
  },
)

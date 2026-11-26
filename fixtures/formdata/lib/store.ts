export interface Invitation {
  email: string
  role: 'member' | 'owner'
  teams: string[]
  notify: boolean
}

interface FormDataStore {
  invitations: Invitation[]
  notes: string[]
}

const shared = globalThis as { fixtureFormDataStore?: FormDataStore }

export const store: FormDataStore = (shared.fixtureFormDataStore ??= { invitations: [], notes: [] })

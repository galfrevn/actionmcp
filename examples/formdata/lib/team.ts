export interface Member {
  email: string
  role: 'member' | 'owner'
}

const shared = globalThis as { exampleTeam?: Member[] }

export const members: Member[] = (shared.exampleTeam ??= [{ email: 'demo@acme.com', role: 'owner' }])

import type { Database } from '../app/lib/seed.ts'

export interface Task {
  id: string
  prompt: string
  verify: (database: Database, answer: string, seed: Database) => boolean
}

function hasMember(database: Database, email: string, role: string): boolean {
  return database.members.some((member) => member.email === email && member.role === role)
}

function isRemoved(database: Database, name: string): boolean {
  return !database.members.some((member) => member.name === name)
}

export const TASKS: Task[] = [
  {
    id: 'invite-member',
    prompt: 'Invite dana@example.com to the team as an owner.',
    verify: (database, _answer, seed) =>
      hasMember(database, 'dana@example.com', 'owner') && database.members.length === seed.members.length + 1,
  },
  {
    id: 'rename-account',
    prompt: 'Change the account name to Northwind Labs.',
    verify: (database) => database.account.name === 'Northwind Labs' && !database.account.deleted,
  },
  {
    id: 'remove-member',
    prompt: 'Remove Priya Raman from the team.',
    verify: (database, _answer, seed) => isRemoved(database, 'Priya Raman') && database.members.length === seed.members.length - 1,
  },
  {
    id: 'list-owners',
    prompt: 'Who are the owners of the team? Answer with their email addresses.',
    verify: (database, answer, seed) => {
      const unchanged = JSON.stringify(database) === JSON.stringify(seed)
      const owners = seed.members.filter((member) => member.role === 'owner')
      const others = seed.members.filter((member) => member.role !== 'owner')
      return unchanged && owners.every((member) => answer.includes(member.email)) && !others.some((member) => answer.includes(member.email))
    },
  },
  {
    id: 'composite',
    prompt: 'Invite sam@example.com as a member, remove Jonas Weber from the team, and rename the account to Acme Research.',
    verify: (database, _answer, seed) =>
      hasMember(database, 'sam@example.com', 'member') &&
      isRemoved(database, 'Jonas Weber') &&
      database.members.length === seed.members.length &&
      database.account.name === 'Acme Research',
  },
]

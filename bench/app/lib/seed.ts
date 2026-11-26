export interface Member {
  id: string
  name: string
  email: string
  role: 'member' | 'owner'
}

export interface Database {
  account: { name: string; deleted: boolean }
  members: Member[]
}

const NAMES = [
  'Ana Torres',
  'Ben Okafor',
  'Chloe Martin',
  'Diego Alvarez',
  'Elena Petrova',
  'Farid Haddad',
  'Grace Liu',
  'Hugo Lambert',
  'Ines Castro',
  'Jonas Weber',
  'Kavya Nair',
  'Liam Murphy',
  'Mei Tanaka',
  'Noah Fischer',
  'Olivia Rossi',
  'Priya Raman',
  'Quentin Dubois',
  'Rosa Jimenez',
  'Sven Olsen',
  'Tara Singh',
  'Umar Farouk',
  'Vera Novak',
  'Wei Zhang',
  'Ximena Rojas',
  'Yusuf Demir',
  'Zoe Carter',
  'Aiko Mori',
  'Bruno Costa',
  'Clara Schmidt',
  'Dev Malhotra',
]
const OWNER_INDEXES = new Set([0, 9, 21])

export function createSeed(): Database {
  return {
    account: { name: 'Acme Inc', deleted: false },
    members: NAMES.map((name, index) => ({
      id: `m${index + 1}`,
      name,
      email: `${name.toLowerCase().replace(' ', '.')}@acme.test`,
      role: OWNER_INDEXES.has(index) ? 'owner' : 'member',
    })),
  }
}

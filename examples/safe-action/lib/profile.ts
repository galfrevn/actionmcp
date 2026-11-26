export interface Profile {
  displayName: string
  bio: string
}

const shared = globalThis as { exampleProfiles?: Map<string, Profile> }
const profiles = (shared.exampleProfiles ??= new Map())

export function profileOf(user: string): Profile {
  let profile = profiles.get(user)
  if (!profile) {
    profile = { displayName: user, bio: '' }
    profiles.set(user, profile)
  }
  return profile
}

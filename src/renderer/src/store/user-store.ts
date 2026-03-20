import { create } from 'zustand'

interface UserProfile {
  name: string
  avatarPath: string | null
}

interface UserState extends UserProfile {
  setName: (name: string) => void
  setAvatarPath: (path: string | null) => void
}

const STORAGE_KEY = 'clave-user-profile'

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { name: 'User', avatarPath: null }
    return { name: 'User', avatarPath: null, ...JSON.parse(raw) }
  } catch {
    return { name: 'User', avatarPath: null }
  }
}

function persist(profile: Partial<UserProfile>): void {
  const current = loadProfile()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...profile }))
}

export function getInitials(name: string): string {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export const useUserStore = create<UserState>((set) => ({
  ...loadProfile(),

  setName: (name) => {
    persist({ name })
    set({ name })
  },

  setAvatarPath: (avatarPath) => {
    persist({ avatarPath })
    set({ avatarPath })
  }
}))

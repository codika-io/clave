import { create } from 'zustand'

export const USER_ICONS = [
  'user',
  'code',
  'terminal',
  'rocket',
  'bolt',
  'fire',
  'heart',
  'star',
  'moon',
  'sun',
  'cube',
  'beaker'
] as const

export type UserIcon = (typeof USER_ICONS)[number]

export const USER_ICON_COLORS = [
  '#3A3A3C',
  '#007AFF',
  '#AF52DE',
  '#34C759',
  '#5AC8FA',
  '#FF6482',
  '#FF3B30',
  '#FFD60A'
] as const

interface UserProfile {
  name: string
  avatarIcon: UserIcon
  avatarColor: string
}

interface UserState extends UserProfile {
  setName: (name: string) => void
  setAvatarIcon: (icon: UserIcon) => void
  setAvatarColor: (color: string) => void
}

const STORAGE_KEY = 'clave-user-profile'

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { name: 'User', avatarIcon: 'user', avatarColor: '#007AFF' }
    const parsed = JSON.parse(raw)
    return {
      name: parsed.name ?? 'User',
      avatarIcon: parsed.avatarIcon ?? 'user',
      avatarColor: parsed.avatarColor ?? '#007AFF'
    }
  } catch {
    return { name: 'User', avatarIcon: 'user', avatarColor: '#007AFF' }
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

  setAvatarIcon: (avatarIcon) => {
    persist({ avatarIcon })
    set({ avatarIcon })
  },

  setAvatarColor: (avatarColor) => {
    persist({ avatarColor })
    set({ avatarColor })
  }
}))

// If no custom name has been saved, resolve the OS username as the default
const profile = loadProfile()
if (profile.name === 'User' && window.electronAPI?.getUsername) {
  window.electronAPI.getUsername().then((osName) => {
    if (osName) {
      useUserStore.getState().setName(osName)
    }
  }).catch(() => {})
}

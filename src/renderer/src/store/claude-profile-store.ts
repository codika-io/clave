import { create } from 'zustand'

/**
 * A Claude Code account profile: a label pointing at a `CLAUDE_CONFIG_DIR`.
 *
 * Claude Code keys its login to the config directory — the default `~/.claude`
 * uses the macOS Keychain, while any custom `CLAUDE_CONFIG_DIR` keeps its own
 * file-based credentials inside that dir. Pointing different sessions at
 * different dirs therefore runs them under independent accounts, with no global
 * env flip. See issue #22.
 *
 * The built-in Default profile has an empty `configDir`: we inject nothing, so a
 * session under it behaves exactly as before (honouring whatever the user's
 * shell already exports). New profiles start signed out — the first session on
 * one runs Claude's normal login flow.
 */
export interface ClaudeProfile {
  id: string
  label: string
  /** Absolute path for CLAUDE_CONFIG_DIR. Empty string = default passthrough. */
  configDir: string
}

export const DEFAULT_CLAUDE_PROFILE_ID = 'default'

const DEFAULT_PROFILE: ClaudeProfile = {
  id: DEFAULT_CLAUDE_PROFILE_ID,
  label: 'Default',
  configDir: ''
}

interface ClaudeProfileState {
  profiles: ClaudeProfile[]
  /** The profile used for keybinding-launched sessions and as the picker's
   *  remembered last choice. */
  selectedProfileId: string
  loaded: boolean
  addProfile: (label: string, configDir: string) => void
  updateProfile: (id: string, updates: Partial<Pick<ClaudeProfile, 'label' | 'configDir'>>) => void
  removeProfile: (id: string) => void
  setSelectedProfile: (id: string) => void
}

function persist(profiles: ClaudeProfile[], selectedProfileId: string): void {
  // Persist only the user-defined profiles; the Default is always re-seeded.
  const custom = profiles.filter((p) => p.id !== DEFAULT_CLAUDE_PROFILE_ID)
  window.electronAPI?.preferencesSet('claudeProfiles', custom).catch(() => {})
  window.electronAPI?.preferencesSet('selectedClaudeProfileId', selectedProfileId).catch(() => {})
}

export const useClaudeProfileStore = create<ClaudeProfileState>((set) => ({
  profiles: [DEFAULT_PROFILE],
  selectedProfileId: DEFAULT_CLAUDE_PROFILE_ID,
  loaded: false,

  addProfile: (label, configDir) =>
    set((state) => {
      const profile: ClaudeProfile = {
        id: crypto.randomUUID(),
        label: label.trim() || 'Account',
        configDir: configDir.trim()
      }
      const profiles = [...state.profiles, profile]
      persist(profiles, state.selectedProfileId)
      return { profiles }
    }),

  updateProfile: (id, updates) =>
    set((state) => {
      if (id === DEFAULT_CLAUDE_PROFILE_ID) return state
      const profiles = state.profiles.map((p) =>
        p.id === id
          ? {
              ...p,
              ...(updates.label !== undefined ? { label: updates.label.trim() || p.label } : {}),
              ...(updates.configDir !== undefined ? { configDir: updates.configDir.trim() } : {})
            }
          : p
      )
      persist(profiles, state.selectedProfileId)
      return { profiles }
    }),

  removeProfile: (id) =>
    set((state) => {
      if (id === DEFAULT_CLAUDE_PROFILE_ID) return state
      const profiles = state.profiles.filter((p) => p.id !== id)
      const selectedProfileId =
        state.selectedProfileId === id ? DEFAULT_CLAUDE_PROFILE_ID : state.selectedProfileId
      persist(profiles, selectedProfileId)
      return { profiles, selectedProfileId }
    }),

  setSelectedProfile: (id) =>
    set((state) => {
      if (!state.profiles.some((p) => p.id === id)) return state
      persist(state.profiles, id)
      return { selectedProfileId: id }
    })
}))

/** Resolve a profile by id, falling back to the Default profile. */
export function getClaudeProfile(id: string | undefined): ClaudeProfile {
  const { profiles } = useClaudeProfileStore.getState()
  return profiles.find((p) => p.id === id) ?? profiles[0] ?? DEFAULT_PROFILE
}

/** The profile keybinding-launched sessions should use. */
export function getSelectedClaudeProfile(): ClaudeProfile {
  const { selectedProfileId } = useClaudeProfileStore.getState()
  return getClaudeProfile(selectedProfileId)
}

/** The spawn fields a profile contributes. `configDir` is undefined for the
 *  Default profile so we never set CLAUDE_CONFIG_DIR on a passthrough session. */
export function claudeProfileSpawnFields(profile: ClaudeProfile): {
  configDir?: string
  claudeProfileId: string
  claudeProfileLabel: string
} {
  return {
    configDir: profile.configDir || undefined,
    claudeProfileId: profile.id,
    claudeProfileLabel: profile.label
  }
}

/** Load persisted profiles from preferences (call once on app start). */
export async function loadClaudeProfiles(): Promise<void> {
  const raw = (await window.electronAPI?.preferencesGet('claudeProfiles')) as ClaudeProfile[] | null
  const selected = (await window.electronAPI?.preferencesGet('selectedClaudeProfileId')) as
    | string
    | null

  const custom = Array.isArray(raw)
    ? raw.filter(
        (p): p is ClaudeProfile =>
          !!p && typeof p.id === 'string' && p.id !== DEFAULT_CLAUDE_PROFILE_ID
      )
    : []
  const profiles = [DEFAULT_PROFILE, ...custom]
  const selectedProfileId =
    selected && profiles.some((p) => p.id === selected) ? selected : DEFAULT_CLAUDE_PROFILE_ID

  useClaudeProfileStore.setState({ profiles, selectedProfileId, loaded: true })
}

import { useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import {
  deleteLaunchProfile,
  profilesFor,
  saveLaunchProfile,
  setGlobalLaunchProfile,
  setWorkspaceLaunchProfile,
  useLaunchProfileStore
} from '../../store/launch-profile-store'
import { getLastAgentSetup, rememberAgentSetup } from '../../store/launch-prefs'
import { useWorkspaceStore } from '../../store/workspace-store'
import type {
  LaunchProfile,
  LauncherFamily,
  PiThinkingLevel
} from '../../../../shared/agent-launch'
import { SettingsCard, SettingsRow, SettingsSection } from './primitives'

const FAMILIES: { id: LauncherFamily; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'codex', label: 'Codex' },
  { id: 'pi', label: 'Pi' }
]
const THINKING: PiThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function TokenEditor({
  label,
  tokens,
  onChange
}: {
  label: string
  tokens: string[]
  onChange: (tokens: string[]) => void
}): React.JSX.Element {
  const replace = (index: number, token: string): void => {
    const next = [...tokens]
    next[index] = token
    onChange(next)
  }
  const move = (index: number, offset: number): void => {
    const target = index + offset
    if (target < 0 || target >= tokens.length) return
    const next = [...tokens]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <div className="settings-row items-start">
      <div className="settings-label pt-2">{label}</div>
      <div className="flex-1 space-y-1.5">
        {tokens.map((token, index) => (
          <div key={index} className="flex gap-1.5">
            <input
              className="input-field flex-1 font-mono"
              value={token}
              onChange={(event) => replace(index, event.target.value)}
              aria-label={`${label} token ${index + 1}`}
            />
            <button
              className="btn-icon btn-icon-md"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              title="Move up"
            >
              <ArrowUpIcon className="w-4 h-4" />
            </button>
            <button
              className="btn-icon btn-icon-md"
              onClick={() => move(index, 1)}
              disabled={index === tokens.length - 1}
              title="Move down"
            >
              <ArrowDownIcon className="w-4 h-4" />
            </button>
            <button
              className="btn-icon btn-icon-md"
              onClick={() => onChange(tokens.filter((_, i) => i !== index))}
              title="Remove token"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          className="btn-secondary inline-flex items-center gap-1.5"
          onClick={() => onChange([...tokens, ''])}
        >
          <PlusIcon className="w-3.5 h-3.5" /> Add token
        </button>
      </div>
    </div>
  )
}

function ProfileEditor({
  profile,
  onDone
}: {
  profile: LaunchProfile
  onDone: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(profile)
  const [error, setError] = useState<string | null>(null)
  const save = async (): Promise<void> => {
    try {
      await saveLaunchProfile({
        ...draft,
        name: draft.name.trim(),
        command: draft.command.filter((token) => token.length > 0),
        additionalArgs: draft.additionalArgs.filter((token) => token.length > 0)
      })
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this profile')
    }
  }
  return (
    <SettingsCard>
      <SettingsRow label="Name">
        <input
          className="input-field w-full"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </SettingsRow>
      <TokenEditor
        label="Command"
        tokens={draft.command}
        onChange={(command) => setDraft({ ...draft, command })}
      />
      <TokenEditor
        label="Additional arguments"
        tokens={draft.additionalArgs}
        onChange={(additionalArgs) => setDraft({ ...draft, additionalArgs })}
      />
      {draft.family === 'pi' && (
        <>
          <SettingsRow label="Provider" description="Optional Pi provider id">
            <input
              className="input-field w-full"
              value={draft.pi?.provider ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  pi: { ...draft.pi, provider: event.target.value || undefined }
                })
              }
            />
          </SettingsRow>
          <SettingsRow label="Model" description="Optional Pi model id">
            <input
              className="input-field w-full"
              value={draft.pi?.model ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, pi: { ...draft.pi, model: event.target.value || undefined } })
              }
            />
          </SettingsRow>
          <SettingsRow label="Thinking">
            <select
              className="input-field"
              value={draft.pi?.thinking ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  pi: {
                    ...draft.pi,
                    thinking: (event.target.value || undefined) as PiThinkingLevel | undefined
                  }
                })
              }
            >
              <option value="">Pi default</option>
              {THINKING.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </SettingsRow>
        </>
      )}
      {error && <div className="px-4 pb-2 text-xs text-danger">{error}</div>}
      <div className="settings-row justify-end gap-2">
        <button className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => void save()}>
          Save profile
        </button>
      </div>
    </SettingsCard>
  )
}

export function AgentsSettings(): React.JSX.Element {
  const preferences = useLaunchProfileStore((state) => state.preferences)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const [editing, setEditing] = useState<LaunchProfile | null>(null)
  const setWorkspaceDefault = async (
    workspaceId: string,
    family: LauncherFamily,
    profileId: string | null
  ): Promise<void> => {
    await setWorkspaceLaunchProfile(workspaceId, family, profileId)
    const setup = getLastAgentSetup(workspaceId)
    const setupFamily = setup.kind === 'claude-agents' ? 'claude' : setup.kind
    if (setupFamily !== family) return
    rememberAgentSetup(workspaceId, {
      ...setup,
      launchProfileId: profileId ?? undefined
    })
  }
  return (
    <>
      <h2 className="text-lg font-semibold text-text-primary mb-2">Agents</h2>
      <p className="text-xs text-text-secondary mb-6">
        Commands are stored locally as argument tokens. Do not put passwords or API keys in them.
      </p>
      <div className="space-y-7">
        {FAMILIES.map(({ id: family, label }) => {
          const profiles = profilesFor(family)
          const globalId =
            preferences.globalDefaults[family] ?? profiles.find((profile) => profile.builtIn)?.id
          const workspaceId = activeWorkspaceId
            ? (preferences.workspaceOverrides[activeWorkspaceId]?.[family] ?? '')
            : ''
          return (
            <SettingsSection key={family} title={label}>
              <SettingsCard>
                <SettingsRow label="Global default">
                  <select
                    className="input-field"
                    value={globalId}
                    onChange={(event) => void setGlobalLaunchProfile(family, event.target.value)}
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                {activeWorkspaceId && (
                  <SettingsRow
                    label="Workspace override"
                    description="Empty uses the global default"
                  >
                    <select
                      className="input-field"
                      value={workspaceId}
                      onChange={(event) =>
                        void setWorkspaceDefault(
                          activeWorkspaceId,
                          family,
                          event.target.value || null
                        )
                      }
                    >
                      <option value="">Use global default</option>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </SettingsRow>
                )}
                {profiles.map((profile) => (
                  <div key={profile.id} className="settings-row">
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary truncate">{profile.name}</div>
                      <div className="text-xs text-text-tertiary font-mono truncate">
                        {profile.command.join(' ')}
                      </div>
                    </div>
                    <div className="ml-auto flex gap-1.5">
                      {profile.builtIn ? (
                        <span className="text-xs text-text-tertiary">Built in</span>
                      ) : (
                        <>
                          <button className="btn-secondary" onClick={() => setEditing(profile)}>
                            Edit
                          </button>
                          <button
                            className="btn-icon btn-icon-md"
                            onClick={() => void deleteLaunchProfile(profile.id)}
                            title="Delete profile"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div className="settings-row">
                  <button
                    className="btn-secondary inline-flex items-center gap-1.5"
                    onClick={() =>
                      setEditing({
                        id: crypto.randomUUID(),
                        name: `Custom ${label}`,
                        family,
                        command: [family === 'antigravity' ? 'agy' : family],
                        additionalArgs: []
                      })
                    }
                  >
                    <PlusIcon className="w-3.5 h-3.5" /> Add profile
                  </button>
                </div>
              </SettingsCard>
              {editing?.family === family && (
                <ProfileEditor profile={editing} onDone={() => setEditing(null)} />
              )}
            </SettingsSection>
          )
        })}
      </div>
    </>
  )
}

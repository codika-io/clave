import { useState, useRef } from 'react'
import { type Theme, useSessionStore } from '../../store/session-store'
import { useWorkTrackerStore } from '../../store/work-tracker-store'
import { useUserStore, USER_ICONS, USER_ICON_COLORS } from '../../store/user-store'
import { useWorkspaceStore } from '../../store/workspace-store'
import { UserIconDisplay, ICON_MAP } from '../ui/UserIconDisplay'
import { CheckIcon } from '@heroicons/react/24/solid'
import { TrashIcon, PlusIcon, PencilIcon, FolderIcon } from '@heroicons/react/24/outline'
import { LocationsTab } from './LocationsTab'

const themes: { id: Theme; label: string; colors: { bg: string; surface: string; text: string; border: string } }[] = [
  {
    id: 'dark',
    label: 'Dark',
    colors: { bg: '#0a0a0a', surface: '#1a1a1a', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.1)' }
  },
  {
    id: 'light',
    label: 'Light',
    colors: { bg: '#f9f9f9', surface: '#e6e6e6', text: 'rgba(0,0,0,0.85)', border: 'rgba(0,0,0,0.12)' }
  },
  {
    id: 'coffee',
    label: 'Coffee',
    colors: { bg: '#eeebe5', surface: '#ddd9d1', text: '#1b1610', border: 'rgba(120,100,80,0.15)' }
  }
]

function ProfileSection() {
  const name = useUserStore((s) => s.name)
  const avatarIcon = useUserStore((s) => s.avatarIcon)
  const avatarColor = useUserStore((s) => s.avatarColor)
  const setName = useUserStore((s) => s.setName)
  const setAvatarIcon = useUserStore((s) => s.setAvatarIcon)
  const setAvatarColor = useUserStore((s) => s.setAvatarColor)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleStartEdit = () => {
    setEditName(name)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSave = () => {
    if (editName.trim()) setName(editName.trim())
    setEditing(false)
  }

  return (
    <section>
      <h3 className="settings-section-title mb-3">
        Profile
      </h3>
      <div className="flex items-start gap-4">
        {/* Avatar preview */}
        <UserIconDisplay icon={avatarIcon} color={avatarColor} size="lg" />

        {/* Name + pickers */}
        <div className="flex-1 min-w-0 space-y-3">
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="input-field"
            />
          ) : (
            <button
              onClick={handleStartEdit}
              className="text-sm font-semibold text-text-primary hover:text-accent transition-colors flex items-center gap-1.5"
            >
              {name}
              <PencilIcon className="w-3 h-3 text-text-tertiary" />
            </button>
          )}

          {/* Icon picker */}
          <div>
            <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Icon</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {USER_ICONS.map((iconName) => {
                const Icon = ICON_MAP[iconName]
                const isSelected = avatarIcon === iconName
                return (
                  <button
                    key={iconName}
                    onClick={() => setAvatarIcon(iconName)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-accent/15 ring-1 ring-accent'
                        : 'bg-surface-200 hover:bg-surface-300'
                    }`}
                    title={iconName}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: isSelected ? avatarColor : 'var(--text-secondary)' }} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Color</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {USER_ICON_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setAvatarColor(color)}
                  className="relative w-5 h-5 rounded-full hover:scale-110 transition-transform flex items-center justify-center"
                  style={{ backgroundColor: color }}
                  title={color}
                >
                  {avatarColor === color && <CheckIcon className="w-3 h-3 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SettingsPanel() {
  const theme = useSessionStore((s) => s.theme)
  const setTheme = useSessionStore((s) => s.setTheme)

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl mx-auto w-full">
        <h2 className="text-lg font-semibold text-text-primary mb-6">Settings</h2>

        <ProfileSection />

        <section className="mt-8">
          <h3 className="settings-section-title mb-3">
            Appearance
          </h3>
          <div className="flex gap-3">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="flex-1 rounded-xl p-1 transition-all duration-200"
                style={{
                  boxShadow: theme === t.id
                    ? '0 0 0 2px var(--color-accent)'
                    : '0 0 0 1px var(--border-color)',
                  background: 'var(--surface-100)'
                }}
              >
                {/* Mini preview */}
                <div
                  className="rounded-lg p-3 mb-2"
                  style={{ background: t.colors.bg, border: `1px solid ${t.colors.border}` }}
                >
                  <div
                    className="h-1.5 w-10 rounded-full mb-2"
                    style={{ background: t.colors.text, opacity: 0.7 }}
                  />
                  <div className="flex gap-1.5">
                    <div
                      className="h-6 flex-1 rounded"
                      style={{ background: t.colors.surface }}
                    />
                    <div
                      className="h-6 flex-1 rounded"
                      style={{ background: t.colors.surface }}
                    />
                  </div>
                  <div
                    className="h-1.5 w-14 rounded-full mt-2"
                    style={{ background: t.colors.text, opacity: 0.4 }}
                  />
                </div>
                <div className="text-xs font-medium text-text-primary text-center pb-1">
                  {t.label}
                </div>
              </button>
            ))}
          </div>
        </section>

        <WorkspacesSection />

        <section className="mt-8">
          <LocationsTab />
        </section>

        <SidebarWidgetsSection />
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-text-secondary">{label}</p>
        <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-300'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function SidebarWidgetsSection() {
  const workTrackerEnabled = useWorkTrackerStore((s) => s.enabled)
  const setWorkTrackerEnabled = useWorkTrackerStore((s) => s.setEnabled)

  return (
    <section className="mt-8">
      <h3 className="settings-section-title mb-3">
        Sidebar Widgets
      </h3>
      <div className="space-y-4">
        <ToggleRow
          label="Work Tracker"
          description="Track daily work time, break reminders, and weekly trends"
          checked={workTrackerEnabled}
          onChange={setWorkTrackerEnabled}
        />
      </div>
    </section>
  )
}

function WorkspacesSection() {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const addWorkspaceFiles = useWorkspaceStore((s) => s.addWorkspaceFiles)
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  const [discoveredFiles, setDiscoveredFiles] = useState<{ name: string; path: string; rootDir: string | null }[] | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)

  const handleAddWorkspace = async () => {
    setDiscoveryError(null)
    setDiscoveredFiles(null)

    const folder = await window.electronAPI?.openFolderDialog()
    if (!folder) return

    // Try discovery first
    const files = await window.electronAPI?.discoverClaveFiles(folder)

    if (!files || files.length === 0) {
      // Legacy fallback: try direct workspace.clave
      const added = await addWorkspace(folder)
      if (!added) {
        setDiscoveryError('No .clave files found in this folder.')
        setTimeout(() => setDiscoveryError(null), 3000)
      }
      return
    }

    if (files.length === 1) {
      // Single file — auto-add
      const added = await addWorkspaceFiles(files)
      if (!added) {
        setDiscoveryError('Workspace already registered.')
        setTimeout(() => setDiscoveryError(null), 3000)
      }
      return
    }

    // Multiple files — show picker
    setDiscoveredFiles(files)
    setSelectedFiles(new Set(files.map((f) => f.path)))
  }

  const handleConfirmSelection = async () => {
    if (!discoveredFiles) return
    const toAdd = discoveredFiles.filter((f) => selectedFiles.has(f.path))
    if (toAdd.length > 0) {
      await addWorkspaceFiles(toAdd)
    }
    setDiscoveredFiles(null)
    setSelectedFiles(new Set())
  }

  const handleCancelDiscovery = () => {
    setDiscoveredFiles(null)
    setSelectedFiles(new Set())
  }

  const toggleFile = (filePath: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }

  return (
    <section className="mt-8">
      <h3 className="settings-section-title mb-3">
        Workspaces
      </h3>
      <p className="text-xs text-text-tertiary mb-4">
        Select a folder to discover <code className="text-text-secondary">.clave</code> workspace files.
        The active workspace auto-loads its groups as pins.
      </p>
      <div className="space-y-2 mb-4">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId
          return (
            <div
              key={ws.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                isActive
                  ? 'bg-accent/10 border-accent/30 text-text-primary'
                  : 'bg-surface-100/50 border-border-subtle text-text-secondary hover:bg-surface-200'
              }`}
              onClick={() => setActiveWorkspace(isActive ? null : ws.id)}
            >
              <FolderIcon className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{ws.name}</div>
                <div className="text-xs text-text-tertiary truncate" title={ws.claveFilePath}>{ws.claveFilePath}</div>
              </div>
              {isActive && (
                <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeWorkspace(ws.id)
                }}
                className="btn-icon btn-icon-sm hover:text-red-400 flex-shrink-0"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Discovery picker */}
      {discoveredFiles && (
        <div className="mt-2 p-3 rounded-lg border border-accent/30 bg-accent/5">
          <p className="text-xs text-text-secondary mb-2 font-medium">
            Found {discoveredFiles.length} workspace files:
          </p>
          <div className="space-y-1">
            {discoveredFiles.map((file) => {
              const isSelected = selectedFiles.has(file.path)
              const alreadyRegistered = workspaces.some((w) => w.claveFilePath === file.path)
              return (
                <label
                  key={file.path}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    alreadyRegistered
                      ? 'opacity-40 cursor-default'
                      : isSelected
                        ? 'bg-accent/10'
                        : 'hover:bg-surface-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={alreadyRegistered}
                    onChange={() => toggleFile(file.path)}
                    className="rounded border-border text-accent focus:ring-accent/30 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-text-primary font-medium">{file.name}</span>
                  {alreadyRegistered && (
                    <span className="text-[11px] text-text-tertiary">(already added)</span>
                  )}
                </label>
              )
            })}
          </div>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={handleConfirmSelection}
              disabled={selectedFiles.size === 0}
              className="btn-primary flex-1"
            >
              Add Selected
            </button>
            <button
              onClick={handleCancelDiscovery}
              className="btn-secondary border border-border-subtle"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {discoveryError && (
        <p className="mt-2 text-xs text-red-400 px-1">{discoveryError}</p>
      )}

      <button onClick={handleAddWorkspace} className="btn-add">
        <PlusIcon className="w-4 h-4" />
        Add Workspace
      </button>
    </section>
  )
}

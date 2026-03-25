import { useEffect, useState, useRef } from 'react'
import { type Theme, type AppIcon, useSessionStore } from '../../store/session-store'
import { useTemplateStore } from '../../store/template-store'
import { useUserStore, USER_ICONS, USER_ICON_COLORS, type UserIcon } from '../../store/user-store'
import { useWorkspaceStore } from '../../store/workspace-store'
import { UserIconDisplay, ICON_MAP } from '../ui/UserIconDisplay'
import { CheckIcon } from '@heroicons/react/24/solid'
import { StarIcon as StarOutline, TrashIcon, PlusIcon, PencilIcon, FolderIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { LocationsTab } from './LocationsTab'

const cLogoPath = 'M742,232 L322,232 A100,100 0 0 0 222,332 L222,732 A100,100 0 0 0 322,832 L742,832 L742,680 L424,680 A50,50 0 0 1 374,630 L374,434 A50,50 0 0 1 424,384 L742,384 Z'
const cDepthBack = 'M802,172 L382,172 A100,100 0 0 0 282,272 L282,672 A100,100 0 0 0 382,772 L802,772 L802,620 L484,620 A50,50 0 0 1 434,570 L434,374 A50,50 0 0 1 484,324 L802,324 Z'
const cDepthTopA = 'M316,238 L748,238 L802,172 L382,172 Z'
const cDepthTopB = 'M418,686 L748,686 L802,620 L484,620 Z'
const cDepthRightA = 'M736,686 L802,620 L802,772 L736,838 Z'
const cDepthRightB = 'M368,440 L434,374 L434,570 L368,636 Z'
const cDepthRightC = 'M736,238 L802,172 L802,324 L736,390 Z'

function IconPreview({ bg, face, depthBack, depthLight, depthDark }: { bg: string; face: string; depthBack: string; depthLight: string; depthDark: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className="w-full h-full">
      <rect width="1024" height="1024" rx="220" ry="220" fill={bg} />
      <path d={cDepthBack} fill={depthBack} />
      <path d={cDepthTopA} fill={depthLight} />
      <path d={cDepthTopB} fill={depthLight} />
      <path d={cDepthRightA} fill={depthDark} />
      <path d={cDepthRightB} fill={depthDark} />
      <path d={cDepthRightC} fill={depthDark} />
      <path d={cLogoPath} fill={face} />
    </svg>
  )
}

const appIcons: { id: AppIcon; label: string; colors: { bg: string; face: string; depthBack: string; depthLight: string; depthDark: string } }[] = [
  { id: 'dark', label: 'Dark', colors: { bg: '#0a0a0a', face: '#ffffff', depthBack: '#2D2D2D', depthLight: '#3A3A3A', depthDark: '#222222' } },
  { id: 'light', label: 'Light', colors: { bg: '#f5f5f5', face: '#1a1a1a', depthBack: '#555555', depthLight: '#666666', depthDark: '#444444' } },
  { id: 'claude', label: 'Claude', colors: { bg: '#da7756', face: '#ffffff', depthBack: '#A45A41', depthLight: '#B96549', depthDark: '#914F39' } }
]

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
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">
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
              className="text-sm text-text-primary bg-surface-200 rounded-lg px-3 py-1.5 w-full outline-none border border-border-subtle focus:border-accent"
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
  const appIcon = useSessionStore((s) => s.appIcon)
  const setAppIcon = useSessionStore((s) => s.setAppIcon)
  const sessions = useSessionStore((s) => s.sessions)

  const templates = useTemplateStore((s) => s.templates)
  const defaultTemplateId = useTemplateStore((s) => s.defaultTemplateId)
  const loaded = useTemplateStore((s) => s.loaded)
  const setDefaultTemplate = useTemplateStore((s) => s.setDefaultTemplate)
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate)
  const updateTemplate = useTemplateStore((s) => s.updateTemplate)
  const captureCurrentLayout = useTemplateStore((s) => s.captureCurrentLayout)

  const [newName, setNewName] = useState('')
  const [isNaming, setIsNaming] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    if (!loaded) useTemplateStore.getState().loadTemplates()
  }, [loaded])

  const handleSaveLayout = () => {
    if (!newName.trim()) return
    captureCurrentLayout(newName.trim())
    setNewName('')
    setIsNaming(false)
  }

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
  }

  const handleFinishRename = () => {
    if (editingId && editingName.trim()) {
      updateTemplate(editingId, { name: editingName.trim() })
    }
    setEditingId(null)
    setEditingName('')
  }

  // Build display list: Blank + user templates
  const blankIsDefault = defaultTemplateId === 'blank'

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl">
        <h2 className="text-lg font-semibold text-text-primary mb-6">Settings</h2>

        <ProfileSection />

        <section className="mt-8">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">
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

        <section className="mt-8">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">
            App Icon
          </h3>
          <div className="flex gap-3">
            {appIcons.map((icon) => (
              <button
                key={icon.id}
                onClick={() => setAppIcon(icon.id)}
                className="rounded-xl p-1.5 transition-all duration-200"
                style={{
                  boxShadow: appIcon === icon.id
                    ? '0 0 0 2px var(--color-accent)'
                    : '0 0 0 1px var(--border-color)',
                  background: 'var(--surface-100)'
                }}
              >
                <div className="rounded-lg overflow-hidden" style={{ width: 48, height: 48 }}>
                  <IconPreview {...icon.colors} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <WorkspacesSection />

        <section className="mt-8">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">
            Launch Templates
          </h3>

          {/* Template list */}
          <div className="space-y-1 mb-3">
            {/* Built-in Blank template */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100">
              <button
                onClick={() => setDefaultTemplate('blank')}
                className="flex-shrink-0 text-text-tertiary hover:text-accent transition-colors"
                title={blankIsDefault ? 'Default template' : 'Set as default'}
              >
                {blankIsDefault ? (
                  <StarSolid className="w-4 h-4 text-accent" />
                ) : (
                  <StarOutline className="w-4 h-4" />
                )}
              </button>
              <span className="text-sm text-text-primary flex-1">Blank</span>
              <span className="text-xs text-text-tertiary">No sessions</span>
            </div>

            {/* User templates */}
            {templates.map((t) => {
              const isDefault = defaultTemplateId === t.id
              const isEditing = editingId === t.id
              const groupCount = t.groups.length
              const sessionCount = t.sessions.length
              const badge =
                groupCount > 0
                  ? `${sessionCount} session${sessionCount !== 1 ? 's' : ''}, ${groupCount} group${groupCount !== 1 ? 's' : ''}`
                  : `${sessionCount} session${sessionCount !== 1 ? 's' : ''}`

              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100"
                >
                  <button
                    onClick={() => setDefaultTemplate(isDefault ? 'blank' : t.id)}
                    className="flex-shrink-0 text-text-tertiary hover:text-accent transition-colors"
                    title={isDefault ? 'Unset default' : 'Set as default'}
                  >
                    {isDefault ? (
                      <StarSolid className="w-4 h-4 text-accent" />
                    ) : (
                      <StarOutline className="w-4 h-4" />
                    )}
                  </button>

                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleFinishRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleFinishRename()
                        if (e.key === 'Escape') {
                          setEditingId(null)
                          setEditingName('')
                        }
                      }}
                      className="text-sm text-text-primary bg-surface-200 rounded px-1.5 py-0.5 flex-1 outline-none border border-border-subtle focus:border-accent"
                    />
                  ) : (
                    <span
                      className="text-sm text-text-primary flex-1 cursor-pointer"
                      onDoubleClick={() => handleStartRename(t.id, t.name)}
                      title="Double-click to rename"
                    >
                      {t.name}
                    </span>
                  )}

                  <span className="text-xs text-text-tertiary flex-shrink-0">{badge}</span>

                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="flex-shrink-0 p-1 rounded hover:bg-surface-200 text-text-tertiary hover:text-red-400 transition-colors"
                    title="Delete template"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Save current layout */}
          {isNaming ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLayout()
                  if (e.key === 'Escape') {
                    setIsNaming(false)
                    setNewName('')
                  }
                }}
                placeholder="Template name..."
                className="flex-1 text-sm bg-surface-200 rounded-lg px-3 py-1.5 outline-none border border-border-subtle focus:border-accent text-text-primary placeholder:text-text-tertiary"
              />
              <button
                onClick={handleSaveLayout}
                disabled={!newName.trim()}
                className="text-sm px-3 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsNaming(true)}
              disabled={sessions.length === 0}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Save current layout
            </button>
          )}
        </section>

        <section className="mt-8">
          <LocationsTab />
        </section>
      </div>
    </div>
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
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">
        Workspaces
      </h3>
      <p className="text-[11px] text-text-tertiary mb-3">
        Select a folder to discover <code className="text-text-secondary">.clave</code> workspace files.
        The active workspace auto-loads its groups as pins.
      </p>
      <div className="space-y-1.5">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId
          return (
            <div
              key={ws.id}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                isActive
                  ? 'bg-accent/10 border-accent/30 text-text-primary'
                  : 'bg-surface-100/50 border-border-subtle text-text-secondary hover:bg-surface-200'
              }`}
              onClick={() => setActiveWorkspace(isActive ? null : ws.id)}
            >
              <FolderIcon className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{ws.name}</div>
                <div className="text-[10px] text-text-tertiary truncate" title={ws.claveFilePath}>{ws.claveFilePath}</div>
              </div>
              {isActive && (
                <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeWorkspace(ws.id)
                }}
                className="p-1 rounded text-text-tertiary hover:text-red-400 transition-colors flex-shrink-0"
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
          <p className="text-[11px] text-text-secondary mb-2 font-medium">
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
                  <span className="text-[12px] text-text-primary font-medium">{file.name}</span>
                  {alreadyRegistered && (
                    <span className="text-[10px] text-text-tertiary">(already added)</span>
                  )}
                </label>
              )
            })}
          </div>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={handleConfirmSelection}
              disabled={selectedFiles.size === 0}
              className="flex-1 px-3 py-1.5 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-default"
            >
              Add Selected
            </button>
            <button
              onClick={handleCancelDiscovery}
              className="px-3 py-1.5 rounded-md border border-border-subtle text-text-tertiary text-[11px] font-medium hover:bg-surface-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {discoveryError && (
        <p className="mt-2 text-[11px] text-red-400 px-1">{discoveryError}</p>
      )}

      <button
        onClick={handleAddWorkspace}
        className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border-subtle text-text-tertiary hover:text-text-secondary hover:border-border hover:bg-surface-100 transition-all text-[12px] font-medium w-full justify-center"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        Add Workspace
      </button>
    </section>
  )
}

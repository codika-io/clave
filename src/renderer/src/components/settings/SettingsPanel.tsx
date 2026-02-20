import { useState, useEffect } from 'react'
import { useSessionStore, type Theme } from '../../store/session-store'
import { useTemplateStore } from '../../store/template-store'
import { StarIcon as StarOutline, TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'

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

export function SettingsPanel() {
  const theme = useSessionStore((s) => s.theme)
  const setTheme = useSessionStore((s) => s.setTheme)
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

        <section>
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
      </div>
    </div>
  )
}

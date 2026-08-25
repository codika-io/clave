import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ClockIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ShieldExclamationIcon,
  ClipboardDocumentIcon,
  PlayIcon
} from '@heroicons/react/24/outline'
import { useHistoryStore } from '../../store/history-store'
import { useSessionStore, inActiveWorkspace } from '../../store/session-store'
import { useWorkspaceStore } from '../../store/workspace-store'
import { resumeHistoryEntry } from '../../lib/session-history'
import { cn, shortenPath } from '../../lib/utils'
import { ContextMenu } from '../ui/ContextMenu'
import type { HistoryListEntry } from '../../../../preload/index.d'

/**
 * The session history (PRDCT-1738): every Claude conversation that lived in
 * this workspace's tabs, past and present, one row each — Claude Code's own
 * title for it, the group it sat in, when the human last spoke, what they
 * said — sorted by that last human message. A group chip narrows the list to
 * the sessions that lived in that group, matched by id OR name (group ids
 * are minted at every launch; the name is how you think of the group).
 * Click resumes the conversation into the selected group, or focuses the tab
 * when it is still open; a session whose transcript Claude Code has cleaned
 * up stays listed, greyed, with nothing to resume.
 *
 * Opened from a group's context menu (that group preselected) or ⌘⇧H (All).
 * Same surface as the group picker: a scrim, a panel, a search field in the
 * header. The panel is keyed on the store's open counter, so every open is a
 * fresh read with the preset chip and an empty filter.
 */

type SortKey = 'last' | 'opened' | 'title'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'last', label: 'Last message' },
  { key: 'opened', label: 'Opened' },
  { key: 'title', label: 'Title' }
]

function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.round(d / 7)
  if (w < 5) return `${w}w ago`
  return new Date(then).toLocaleDateString()
}

/** One line of the last prompt: whitespace collapsed, cut for the row. */
function excerpt(text: string | null, max = 160): string | null {
  if (!text) return null
  const one = text.replace(/\s+/g, ' ').trim()
  if (!one) return null
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function entryMatchesGroup(
  entry: HistoryListEntry,
  group: { id: string; name: string }
): boolean {
  return entry.groups.some((g) => g.id === group.id || (g.name !== '' && g.name === group.name))
}

export function SessionHistoryDialog(): React.JSX.Element | null {
  const open = useHistoryStore((s) => s.open)
  const openSeq = useHistoryStore((s) => s.openSeq)
  const presetGroupId = useHistoryStore((s) => s.groupId)
  if (!open) return null
  return <HistoryPanel key={openSeq} presetGroupId={presetGroupId} />
}

function HistoryPanel({ presetGroupId }: { presetGroupId: string | null }): React.ReactPortal {
  const closeHistory = useHistoryStore((s) => s.closeHistory)
  const groups = useSessionStore((s) => s.groups)
  const sessions = useSessionStore((s) => s.sessions)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  const [entries, setEntries] = useState<HistoryListEntry[] | null>(null)
  const [groupId, setGroupId] = useState<string | null>(presetGroupId)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('last')
  const [menu, setMenu] = useState<{ x: number; y: number; entry: HistoryListEntry } | null>(null)

  // One read per open: the ledger and the transcripts moved since last time.
  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .historyList()
      .then((r) => {
        if (!cancelled) setEntries(r.entries)
      })
      .catch((err) => {
        console.error('Failed to read the session history:', err)
        if (!cancelled) setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeHistory()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeHistory])

  const chipGroups = useMemo(
    () =>
      groups
        .filter((g) => inActiveWorkspace(g, activeWorkspaceId))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [groups, activeWorkspaceId]
  )
  const selectedGroup = groupId ? (chipGroups.find((g) => g.id === groupId) ?? null) : null

  const liveIds = useMemo(
    () =>
      new Set(sessions.filter((s) => s.alive && s.claudeSessionId).map((s) => s.claudeSessionId)),
    [sessions]
  )

  const rows = useMemo(() => {
    if (!entries) return []
    const q = query.trim().toLowerCase()
    const list = entries.filter((e) => {
      // The seed knows no workspace (null): shown everywhere.
      if (e.workspaceId && activeWorkspaceId && e.workspaceId !== activeWorkspaceId) return false
      if (selectedGroup && !entryMatchesGroup(e, selectedGroup)) return false
      if (!q) return true
      const hay = [
        e.title,
        e.name,
        e.transcript.lastPrompt ?? '',
        e.cwd,
        ...e.groups.map((g) => g.name)
      ]
        .join('\n')
        .toLowerCase()
      return hay.includes(q)
    })
    const cmp: Record<SortKey, (a: HistoryListEntry, b: HistoryListEntry) => number> = {
      last: (a, b) => b.lastHumanAt.localeCompare(a.lastHumanAt),
      opened: (a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt),
      title: (a, b) => a.title.localeCompare(b.title)
    }
    return list.sort(cmp[sort])
  }, [entries, query, selectedGroup, sort, activeWorkspaceId])

  const resume = useCallback(
    (entry: HistoryListEntry, dangerousMode: boolean) => {
      closeHistory()
      void resumeHistoryEntry(entry, { groupId: selectedGroup?.id ?? null, dangerousMode })
    },
    [closeHistory, selectedGroup]
  )

  const latestGroupName = (e: HistoryListEntry): string | null =>
    e.groups.length > 0 ? e.groups[e.groups.length - 1].name || null : null

  return createPortal(
    <div
      className="group-picker-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Session history"
      data-history-dialog
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeHistory()
      }}
    >
      <div className="group-picker-panel group-picker-panel--history">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
          <ClockIcon className="w-5 h-5 flex-shrink-0 text-text-tertiary" />
          <h2 className="text-sm font-medium text-text-primary">History</h2>
          <div className="relative flex-1 min-w-0 ml-2">
            <MagnifyingGlassIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rows[0]) resume(rows[0], e.altKey)
              }}
              placeholder="Filter by title, last message, folder…"
              className="input-compact input-compact-icon-right w-full"
              data-history-filter
            />
          </div>
          <button className="btn-icon btn-icon-sm" onClick={closeHistory} aria-label="Close">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="history-controls">
          <div className="history-chips" role="tablist" aria-label="Groups">
            <button
              type="button"
              className="group-switcher-chip"
              data-history-chip="all"
              data-selected={groupId === null ? 'true' : undefined}
              onClick={() => setGroupId(null)}
            >
              All
            </button>
            {chipGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                className="group-switcher-chip"
                data-history-chip={g.id}
                data-selected={g.id === groupId ? 'true' : undefined}
                onClick={() => setGroupId(g.id === groupId ? null : g.id)}
                title={`Sessions that lived in "${g.name}" — by group id or name`}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="history-chips history-chips--sort" role="radiogroup" aria-label="Sort">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className="group-switcher-chip"
                data-history-sort={s.key}
                data-selected={s.key === sort ? 'true' : undefined}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3" data-history-list>
          {entries === null ? (
            <p className="py-10 text-center text-xs text-text-tertiary">Reading…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-xs text-text-tertiary">
              {entries.length === 0
                ? 'No sessions yet. Claude sessions appear here as they run.'
                : selectedGroup
                  ? `No sessions in "${selectedGroup.name}"${query ? ' match' : ''}.`
                  : 'No matching sessions.'}
            </p>
          ) : (
            rows.map((e) => {
              const live = liveIds.has(e.claudeSessionId)
              const missing = !e.transcript.exists
              const prompt = excerpt(e.transcript.lastPrompt)
              const gname = latestGroupName(e)
              return (
                <button
                  key={e.claudeSessionId}
                  type="button"
                  className="history-row"
                  data-history-row={e.claudeSessionId}
                  data-live={live ? 'true' : undefined}
                  data-missing={missing ? 'true' : undefined}
                  onClick={(ev) => resume(e, ev.altKey)}
                  onContextMenu={(ev) => {
                    ev.preventDefault()
                    setMenu({ x: ev.clientX, y: ev.clientY, entry: e })
                  }}
                  title={
                    missing
                      ? 'Transcript no longer on disk — Claude Code cleaned it up; nothing to resume.'
                      : live
                        ? 'Open — click to focus the tab'
                        : `Resume in ${selectedGroup?.name ?? 'the sidebar'} · ⌥-click to skip permissions`
                  }
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="terminal-row-dot flex-shrink-0"
                      data-running={live ? 'true' : undefined}
                      style={live ? { backgroundColor: 'var(--color-accent)' } : undefined}
                      aria-label={live ? 'open' : 'closed'}
                    />
                    <span className="history-row-title truncate">{e.title}</span>
                    {gname && <span className="history-row-group truncate">{gname}</span>}
                    <span className="history-row-time tabular-nums">
                      {relativeTime(e.lastHumanAt)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'history-row-prompt truncate',
                      !prompt && 'history-row-prompt--none'
                    )}
                  >
                    {missing ? 'Transcript gone' : (prompt ?? shortenPath(e.cwd))}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-1.5 px-5 py-2.5 border-t border-border-subtle text-[11px] text-text-tertiary/70">
          <span className="truncate">
            {entries
              ? `${rows.length} of ${entries.length} session${entries.length === 1 ? '' : 's'} · click to resume, ⌥-click to skip permissions`
              : ' '}
          </span>
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          className="z-[70]"
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Resume',
              icon: <PlayIcon className="w-3.5 h-3.5" />,
              disabled:
                !menu.entry.transcript.exists && !liveIds.has(menu.entry.claudeSessionId),
              onClick: () => resume(menu.entry, false)
            },
            {
              label: 'Resume (skip permissions)',
              icon: <ShieldExclamationIcon className="w-3.5 h-3.5" />,
              disabled: !menu.entry.transcript.exists,
              onClick: () => resume(menu.entry, true)
            },
            {
              label: 'Copy session id',
              icon: <ClipboardDocumentIcon className="w-3.5 h-3.5" />,
              onClick: () => void navigator.clipboard.writeText(menu.entry.claudeSessionId)
            }
          ]}
        />
      )}
    </div>,
    document.body
  )
}

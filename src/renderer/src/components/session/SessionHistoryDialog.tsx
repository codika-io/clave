import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { dotStateOf, visibleInWorkspace } from '../../lib/session-history-diff'
import { cn, shortenPath } from '../../lib/utils'
import { ContextMenu } from '../ui/ContextMenu'
import { entryInGroup } from '../../../../shared/history-group-match'
import type {
  HistoryListEntry,
  HistorySearchHit,
  HistorySearchScope
} from '../../../../preload/index.d'

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
 * The field filters the rows instantly (title, last prompt, folder, group).
 * Switching its scope to Human, Agent or Tools turns it into a search INSIDE
 * the transcripts of the rows in scope — streamed from the main process,
 * cancelled the moment the query or the scope changes — and each row then
 * shows the excerpts that matched.
 *
 * Opened from a group's context menu (that group preselected) or ⌘⇧H (All).
 * Same surface as the group picker: a scrim, a panel, a search field in the
 * header. The panel is keyed on the store's open counter, so every open is a
 * fresh read with the preset chip and an empty filter.
 */

type SortKey = 'last' | 'opened' | 'title'
type Scope = 'titles' | HistorySearchScope

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'last', label: 'Last message' },
  { key: 'opened', label: 'Opened' },
  { key: 'title', label: 'Title' }
]

const SCOPES: { key: Scope; label: string; title: string }[] = [
  { key: 'titles', label: 'Titles', title: 'Filter the rows: title, last message, folder, group' },
  { key: 'human', label: 'Human', title: 'Search what you typed, inside the transcripts' },
  { key: 'agent', label: 'Agent', title: 'Search what the agent answered' },
  { key: 'tools', label: 'Tools', title: 'Search the tools it called: names, inputs, results' }
]

const SEARCH_MIN_CHARS = 2
const SEARCH_DEBOUNCE_MS = 250
const HITS_PER_ROW = 3

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

/** The excerpt with the query marked, case-insensitively. */
function Highlight({ text, query }: { text: string; query: string }): React.JSX.Element {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  )
}

/** Request ids are matched in ONE main-process map across every window, so
 *  a per-window token keeps two windows' searches from cancelling each other. */
const WINDOW_TOKEN = Math.random().toString(36).slice(2, 10)
let searchSeq = 0

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
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeRoot = workspaces.find((w) => w.id === activeWorkspaceId)?.rootDir ?? null

  const [entries, setEntries] = useState<HistoryListEntry[] | null>(null)
  const [groupId, setGroupId] = useState<string | null>(presetGroupId)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('last')
  const [scope, setScope] = useState<Scope>('titles')
  /** Everything: the whole transcript store, not only what the ledger knows. */
  const [all, setAll] = useState(false)
  /** Open tabs only. */
  const [openOnly, setOpenOnly] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: HistoryListEntry } | null>(null)

  // The transcript search: hits per session for the CURRENT request only,
  // and the totals once it ends. A request id per query keeps late batches
  // of a cancelled search from landing on the next one.
  const [hits, setHits] = useState<Map<string, HistorySearchHit[]>>(new Map())
  const [searchState, setSearchState] = useState<
    | { status: 'idle' }
    | { status: 'searching' }
    | { status: 'done'; files: number; truncated: boolean }
  >({ status: 'idle' })
  const requestRef = useRef<string | null>(null)

  // One read per open (and per Everything toggle): the ledger and the
  // transcripts moved since last time.
  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .historyList(all ? { all: true } : undefined)
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
  }, [all])

  // Escape closes the row's context menu when one is open (Radix dismisses
  // it on the same key), and only otherwise the dialog.
  const menuRef = useRef(menu)
  useEffect(() => {
    menuRef.current = menu
  }, [menu])
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (menuRef.current) setMenu(null)
      else closeHistory()
    }
    // Capture phase, registered at mount: Radix dismisses its menu from a
    // capture listener too, and React flushes that discrete update before
    // a bubble listener would run — which then saw no menu and closed the
    // dialog. Registered first, this one decides first.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
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

  /** Live conversation → its run state, the sidebar's own words. Memoised on
   *  a STABLE signature, not on the sessions array: that array gets a fresh
   *  identity on every store update (activity, output, renames), and hanging
   *  the map — and therefore the search scope — off it cancelled and
   *  restarted a running transcript search on churn this very dialog renders. */
  const liveSignature = useMemo(
    () =>
      sessions
        .filter((s) => s.alive && s.claudeSessionId)
        .map((s) => `${s.claudeSessionId}:${s.agentState ?? 'idle'}`)
        .sort()
        .join('|'),
    [sessions]
  )
  const liveStates = useMemo(
    () =>
      new Map<string, string>(
        liveSignature === ''
          ? []
          : liveSignature.split('|').map((pair) => {
              const at = pair.lastIndexOf(':')
              return [pair.slice(0, at), pair.slice(at + 1)] as const
            })
      ),
    [liveSignature]
  )

  // The rows in SCOPE: workspace and group, before any text. This is what a
  // transcript search reads, and what the title filter narrows.
  const inScope = useMemo(() => {
    if (!entries) return []
    return entries.filter((e) => {
      // A stamped entry by its workspace; an unstamped one (the seed, an
      // Everything transcript) by its own cwd against the workspace root.
      if (!visibleInWorkspace(e, activeWorkspaceId, activeRoot)) return false
      if (selectedGroup && !entryInGroup(e.groups, selectedGroup)) return false
      if (openOnly && !liveStates.has(e.claudeSessionId)) return false
      return true
    })
  }, [entries, selectedGroup, activeWorkspaceId, activeRoot, openOnly, liveStates])

  const trimmed = query.trim()
  const searching = scope !== 'titles' && trimmed.length >= SEARCH_MIN_CHARS
  const searchIds = useMemo(
    () => inScope.filter((e) => e.transcript.exists).map((e) => e.claudeSessionId),
    [inScope]
  )

  // Hits arrive per file; only the current request's land.
  useEffect(() => {
    return window.electronAPI.onHistorySearchHits(({ requestId, hits: batch }) => {
      if (requestId !== requestRef.current) return
      setHits((prev) => {
        const next = new Map(prev)
        for (const h of batch)
          next.set(h.claudeSessionId, [...(next.get(h.claudeSessionId) ?? []), h])
        return next
      })
    })
  }, [])

  // Start (debounced) or stop the transcript search as the query, the scope
  // or the rows in scope change; a change mid-search cancels the running one.
  useEffect(() => {
    const cancelRunning = (): void => {
      if (requestRef.current) {
        window.electronAPI.historySearchCancel(requestRef.current)
        requestRef.current = null
      }
    }
    if (!searching) {
      cancelRunning()
      return
    }
    const timer = setTimeout(() => {
      cancelRunning()
      const requestId = `history-${WINDOW_TOKEN}-${++searchSeq}`
      requestRef.current = requestId
      setHits(new Map())
      setSearchState({ status: 'searching' })
      window.electronAPI
        .historySearch({ requestId, query: trimmed, scope, claudeSessionIds: searchIds })
        .then((done) => {
          if (requestRef.current !== requestId) return
          setSearchState({ status: 'done', files: done.filesSearched, truncated: done.truncated })
        })
        .catch((err) => {
          console.error('Transcript search failed:', err)
          if (requestRef.current === requestId) setSearchState({ status: 'idle' })
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      cancelRunning()
    }
    // searchIds changes identity only when the scope's membership changes.
  }, [searching, trimmed, scope, searchIds])

  const rows = useMemo(() => {
    const q = trimmed.toLowerCase()
    const list = searching
      ? inScope.filter((e) => hits.has(e.claudeSessionId))
      : inScope.filter((e) => {
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
  }, [inScope, trimmed, searching, hits, sort])

  const resume = useCallback(
    (entry: HistoryListEntry, dangerousMode: boolean) => {
      // Nothing to resume (transcript gone or folder unknown, tab not
      // open): the dialog stays, the row's own title says why.
      if (!liveStates.has(entry.claudeSessionId) && (!entry.transcript.exists || !entry.cwd)) return
      closeHistory()
      void resumeHistoryEntry(entry, { groupId: selectedGroup?.id ?? null, dangerousMode })
    },
    [closeHistory, selectedGroup, liveStates]
  )

  const latestGroupName = (e: HistoryListEntry): string | null =>
    e.groups.length > 0 ? e.groups[e.groups.length - 1].name || null : null

  const footer = ((): string => {
    if (!entries) return ' '
    if (searching) {
      if (searchState.status === 'searching')
        return `Searching ${searchIds.length} transcript${searchIds.length === 1 ? '' : 's'}…`
      if (searchState.status === 'done') {
        const n = [...hits.values()].reduce((a, b) => a + b.length, 0)
        return `${n} hit${n === 1 ? '' : 's'} in ${rows.length} of ${searchState.files} transcript${searchState.files === 1 ? '' : 's'}${searchState.truncated ? ' · stopped at the cap' : ''}`
      }
      return ' '
    }
    return `${rows.length} of ${inScope.length} session${inScope.length === 1 ? '' : 's'} · click to resume, ⌥-click to skip permissions`
  })()

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
              placeholder={
                scope === 'titles'
                  ? 'Filter by title, last message, folder…'
                  : `Search ${scope === 'human' ? 'what you said' : scope === 'agent' ? 'what the agent said' : 'tool calls and results'}…`
              }
              className="input-compact input-compact-icon-right w-full"
              data-history-filter
            />
          </div>
          <button className="btn-icon btn-icon-sm" onClick={closeHistory} aria-label="Close">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="history-controls">
          <div className="history-controls-row">
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
            <div className="history-chips history-chips--sort" aria-label="Which conversations">
              <button
                type="button"
                className="group-switcher-chip"
                data-history-all
                data-selected={all ? 'true' : undefined}
                title="Every Claude Code conversation on this Mac, Clave or not — scoped to this workspace by each conversation's own folder"
                onClick={() => {
                  setAll((v) => !v)
                  setEntries(null)
                }}
              >
                Everything
              </button>
              <button
                type="button"
                className="group-switcher-chip"
                data-history-open
                data-selected={openOnly ? 'true' : undefined}
                title="Only conversations open as a tab right now"
                onClick={() => setOpenOnly((v) => !v)}
              >
                Open
              </button>
            </div>
          </div>
          <div className="history-controls-row">
            <div className="history-chips" role="radiogroup" aria-label="Search in">
              {SCOPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="group-switcher-chip"
                  data-history-scope={s.key}
                  data-selected={s.key === scope ? 'true' : undefined}
                  title={s.title}
                  onClick={() => setScope(s.key)}
                >
                  {s.label}
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
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3" data-history-list>
          {entries === null ? (
            <p className="py-10 text-center text-xs text-text-tertiary">Reading…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-xs text-text-tertiary">
              {entries.length === 0
                ? 'No sessions yet. Claude sessions appear here as they run.'
                : searching && searchState.status === 'searching'
                  ? 'Searching…'
                  : searching
                    ? `Nothing in the ${scope} messages matches "${trimmed}".`
                    : selectedGroup
                      ? `No sessions in "${selectedGroup.name}"${query ? ' match' : ''}.`
                      : 'No matching sessions.'}
            </p>
          ) : (
            rows.map((e) => {
              const live = liveStates.has(e.claudeSessionId)
              const dotState = dotStateOf(live, liveStates.get(e.claudeSessionId))
              const missing = !e.transcript.exists
              const prompt = excerpt(e.transcript.lastPrompt)
              const gname =
                latestGroupName(e) ??
                (e.source === 'transcript' && e.cwd ? (e.cwd.split('/').pop() ?? null) : null)
              const rowHits = searching ? (hits.get(e.claudeSessionId) ?? []) : []
              return (
                <button
                  key={e.claudeSessionId}
                  type="button"
                  className="history-row"
                  data-history-row={e.claudeSessionId}
                  data-live={live ? 'true' : undefined}
                  data-state={dotState}
                  data-missing={missing ? 'true' : undefined}
                  data-hits={searching ? rowHits.length : undefined}
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
                      className="history-dot flex-shrink-0"
                      data-state={dotState}
                      aria-label={dotState}
                    />
                    <span className="history-row-title truncate">{e.title}</span>
                    {gname && <span className="history-row-group truncate">{gname}</span>}
                    <span className="history-row-time tabular-nums">
                      {relativeTime(e.lastHumanAt)}
                    </span>
                  </span>
                  {searching ? (
                    rowHits.slice(0, HITS_PER_ROW).map((h, i) => (
                      <span key={i} className="history-hit truncate" data-history-hit>
                        <Highlight text={h.excerpt} query={trimmed} />
                      </span>
                    ))
                  ) : (
                    <span
                      className={cn(
                        'history-row-prompt truncate',
                        !prompt && 'history-row-prompt--none'
                      )}
                    >
                      {missing ? 'Transcript gone' : (prompt ?? shortenPath(e.cwd))}
                    </span>
                  )}
                  {searching && rowHits.length > HITS_PER_ROW && (
                    <span className="history-hit history-row-prompt--none">
                      +{rowHits.length - HITS_PER_ROW} more
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-1.5 px-5 py-2.5 border-t border-border-subtle text-[11px] text-text-tertiary/70">
          <span className="truncate" data-history-footer>
            {footer}
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
                (!menu.entry.transcript.exists || !menu.entry.cwd) &&
                !liveStates.has(menu.entry.claudeSessionId),
              onClick: () => resume(menu.entry, false)
            },
            {
              label: 'Resume (skip permissions)',
              icon: <ShieldExclamationIcon className="w-3.5 h-3.5" />,
              disabled: !menu.entry.transcript.exists || !menu.entry.cwd,
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

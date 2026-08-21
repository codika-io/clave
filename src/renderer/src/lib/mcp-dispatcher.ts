import {
  captureEndpoint as captureEndpointOf,
  emitTabClosed,
  groupOfSession,
  sessionMode,
  type SessionMode
} from './exchange-capture'
import { useSessionStore, fileTabDedupKey, inActiveWorkspace } from '../store/session-store'
import type { GroupTerminalConfig, Session, SessionGroup } from '../store/session-store'
import { usePinnedStore, getPinnedState, togglePinnedGroup } from '../store/pinned-store'
import type { PinnedGroupSession } from '../store/session-types'
import { useWorkspaceStore, type Workspace } from '../store/workspace-store'
import { setActiveWorkspace } from './workspace-actions'
import { getRegisteredTerminal } from './terminal-registry'
import { getDraftShadow, type DraftStash } from './draft-shadow'
import { buildProvenanceHeader } from '../../../shared/exchange-provenance'

/**
 * Renderer-side executor for the in-app MCP server. The sidebar state (groups,
 * tabs) lives in this process's Zustand store, so the main process forwards
 * each MCP tool call here over `mcp:command` and we reply on `mcp:response`.
 */

interface McpCommandMessage {
  requestId: string
  command: string
  payload: unknown
}

/** Resolve a workspace reference: id, exact name, or case-insensitive name. */
function resolveWorkspace(ref: string): Workspace {
  const { workspaces } = useWorkspaceStore.getState()
  if (workspaces.length === 0) {
    throw new Error('No workspaces configured — the workspace parameter cannot be used')
  }
  const ws =
    workspaces.find((w) => w.id === ref) ??
    workspaces.find((w) => w.name === ref) ??
    workspaces.find((w) => w.name.toLowerCase() === ref.toLowerCase())
  if (!ws) {
    throw new Error(
      `No workspace "${ref}". Available: ${workspaces.map((w) => w.name).join(', ')}`
    )
  }
  return ws
}

function workspaceNameOf(id: string | null | undefined): string | null {
  if (!id) return null
  return useWorkspaceStore.getState().workspaces.find((w) => w.id === id)?.name ?? null
}

/** Workspace to stamp on something an agent creates: an explicit `workspace`
 *  param wins, else the CALLER tab's workspace (agents stay in their own
 *  workspace by default), else the active one. Undefined in no-workspace mode. */
function workspaceForSpawn(
  explicit: string | undefined,
  callerSessionId: string | undefined
): string | undefined {
  if (explicit) return resolveWorkspace(explicit).id
  const caller = callerSessionId
    ? useSessionStore.getState().sessions.find((s) => s.id === callerSessionId)
    : undefined
  return caller?.workspaceId ?? useWorkspaceStore.getState().activeWorkspaceId ?? undefined
}

/** Resolve a tool's group reference: a group id, a group name, or "mine".
 *  Name resolution is workspace-scoped — caller's workspace first, then the
 *  active one, then a unique global match; a name that matches in several
 *  workspaces errors with qualified candidates instead of picking one. */
function resolveGroup(
  groups: SessionGroup[],
  ref: string,
  callerSessionId: string | undefined
): SessionGroup {
  if (ref === 'mine') {
    if (!callerSessionId) {
      throw new Error('groupId "mine" requires the call to come from inside a Clave session')
    }
    const group = groupOfSession(groups, callerSessionId)
    if (!group) throw new Error('The calling session is not in any group')
    return group
  }
  const byId = groups.find((g) => g.id === ref)
  if (byId) return byId

  const named = groups.filter((g) => g.name === ref)
  if (named.length === 0) throw new Error(`No group with id or name "${ref}"`)
  if (named.length === 1) return named[0]

  const callerWs = callerSessionId
    ? useSessionStore.getState().sessions.find((s) => s.id === callerSessionId)?.workspaceId
    : undefined
  const inCallerWs = callerWs ? named.filter((g) => g.workspaceId === callerWs) : []
  if (inCallerWs.length === 1) return inCallerWs[0]
  const activeWs = useWorkspaceStore.getState().activeWorkspaceId
  const inActiveWs = activeWs ? named.filter((g) => g.workspaceId === activeWs) : []
  if (inActiveWs.length === 1) return inActiveWs[0]

  const qualified = named
    .map((g) => `${workspaceNameOf(g.workspaceId) ?? '?'}/${g.name} (${g.id})`)
    .join(', ')
  throw new Error(`Group name "${ref}" is ambiguous across workspaces — use an id. Candidates: ${qualified}`)
}

function handleList(payload: { callerSessionId?: string; workspace?: string }): unknown {
  const state = useSessionStore.getState()
  const wsState = useWorkspaceStore.getState()

  // Optional scoping: 'all' (default — agents may orchestrate across
  // workspaces), 'active', or a workspace id/name.
  const scope = payload.workspace ?? 'all'
  const scopeId: string | null | 'all' =
    scope === 'all'
      ? 'all'
      : scope === 'active'
        ? wsState.activeWorkspaceId
        : resolveWorkspace(scope).id
  const inScope = (x: { workspaceId?: string | null }): boolean =>
    scopeId === 'all' || inActiveWorkspace(x, scopeId)

  const sessions = state.sessions
    .filter((s) => s.sessionType === 'local' && inScope(s))
    .map((s) => ({
      id: s.id,
      name: s.name,
      cwd: s.cwd,
      mode: sessionMode(s),
      alive: s.alive,
      agentState: s.agentState ?? null,
      groupId: groupOfSession(state.groups, s.id)?.id ?? null,
      workspaceId: s.workspaceId ?? null,
      workspaceName: workspaceNameOf(s.workspaceId)
    }))
  const groups = state.groups.filter(inScope).map((g) => ({
    id: g.id,
    name: g.name,
    cwd: g.cwd,
    color: g.color ?? null,
    sessionIds: g.sessionIds,
    workspaceId: g.workspaceId ?? null,
    workspaceName: workspaceNameOf(g.workspaceId),
    terminals: g.terminals.map((t) => ({
      id: t.id,
      command: t.command,
      commandMode: t.commandMode,
      color: t.color,
      icon: t.icon ?? null,
      serverUrl: t.serverUrl ?? null,
      sessionId: t.sessionId
    }))
  }))
  const pinnedSessionMode = (s: PinnedGroupSession): SessionMode => {
    if (s.antigravityMode) return 'antigravity'
    if (s.codexMode) return 'codex'
    if (s.claudeAgentsMode) return 'claude-agents'
    if (s.claudeMode) return 'claude'
    return 'terminal'
  }
  // Pinned groups = launchable templates from .clave files (auto-discovered or
  // imported). clave_launch_group spawns them by id or name.
  const pinnedGroups = usePinnedStore
    .getState()
    .pinnedGroups.filter(inScope)
    .map((pg) => ({
      id: pg.id,
      name: pg.name,
      cwd: pg.cwd,
      category: pg.category ?? null,
      sourceFile: pg.filePath ?? pg.discoveredBy ?? null,
      state: getPinnedState(pg),
      activeGroupId: pg.activeGroupId,
      workspaceId: pg.workspaceId ?? null,
      workspaceName: workspaceNameOf(pg.workspaceId),
      sessions: pg.sessions.map((s) => ({ name: s.name, cwd: s.cwd, mode: pinnedSessionMode(s) })),
      terminals: pg.terminals.map((t) => ({ command: t.command, commandMode: t.commandMode }))
    }))
  const callerSessionId = payload.callerSessionId ?? null
  return {
    workspaces: wsState.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      rootDir: w.rootDir,
      active: w.id === wsState.activeWorkspaceId
    })),
    activeWorkspaceId: wsState.activeWorkspaceId,
    groups,
    sessions,
    pinnedGroups,
    focusedSessionId: state.focusedSessionId,
    callerSessionId,
    callerGroupId: callerSessionId
      ? (groupOfSession(state.groups, callerSessionId)?.id ?? null)
      : null
  }
}

async function handleLaunchGroup(payload: {
  group: string
  workspace?: string
  callerSessionId?: string
}): Promise<unknown> {
  const pinnedGroups = usePinnedStore.getState().pinnedGroups
  // Optional explicit workspace narrows the search; otherwise name resolution
  // prefers the caller's workspace, then the active one, then a unique global
  // match — "Syndicable" existing in two workspaces must not silently pick one.
  const pool = payload.workspace
    ? (() => {
        const ws = resolveWorkspace(payload.workspace)
        return pinnedGroups.filter((p) => p.workspaceId === ws.id)
      })()
    : pinnedGroups
  const byId = pool.find((p) => p.id === payload.group)
  const named = byId
    ? [byId]
    : (() => {
        const exact = pool.filter((p) => p.name === payload.group)
        if (exact.length > 0) return exact
        return pool.filter((p) => p.name.toLowerCase() === payload.group.toLowerCase())
      })()
  let pg = named.length === 1 ? named[0] : undefined
  if (!pg && named.length > 1) {
    const callerWs = payload.callerSessionId
      ? useSessionStore.getState().sessions.find((s) => s.id === payload.callerSessionId)?.workspaceId
      : undefined
    const inCallerWs = callerWs ? named.filter((p) => p.workspaceId === callerWs) : []
    if (inCallerWs.length === 1) pg = inCallerWs[0]
    if (!pg) {
      const activeWs = useWorkspaceStore.getState().activeWorkspaceId
      const inActiveWs = activeWs ? named.filter((p) => p.workspaceId === activeWs) : []
      if (inActiveWs.length === 1) pg = inActiveWs[0]
    }
    if (!pg) {
      const qualified = named
        .map((p) => `${workspaceNameOf(p.workspaceId) ?? '?'}/${p.name} (${p.id})`)
        .join(', ')
      throw new Error(
        `Pinned group "${payload.group}" is ambiguous across workspaces — pass the workspace parameter or an id. Candidates: ${qualified}`
      )
    }
  }
  if (!pg) {
    const available = pool.map((p) => p.name).join(', ') || '(none)'
    throw new Error(`No pinned group "${payload.group}". Available: ${available}`)
  }

  // A pin can point at a group that was since deleted — e.g. an agent moved
  // the pin's last tab out, which prunes the now-empty group. The pin still
  // reads as active-visible (activeGroupId set, visible true), which would
  // make both the early-return below AND togglePinnedGroup's hide-path treat
  // it as live and never respawn. Reset the stale link so the toggle takes the
  // fresh-spawn path.
  const linkedGroupAlive = (g: string | null): boolean =>
    !!g && useSessionStore.getState().groups.some((grp) => grp.id === g)
  if (pg.activeGroupId && !linkedGroupAlive(pg.activeGroupId)) {
    usePinnedStore.getState().setActiveGroupId(pg.id, null)
    usePinnedStore.getState().setVisible(pg.id, false)
  }

  const current = usePinnedStore.getState().pinnedGroups.find((p) => p.id === pg.id) ?? pg
  const stateBefore = getPinnedState(current)
  if (stateBefore === 'active-visible') {
    return { pinnedId: pg.id, groupId: current.activeGroupId, status: 'already-running' }
  }
  // idle → spawn all sessions + terminals; active-hidden → show the live group.
  await togglePinnedGroup(pg.id)
  const after = usePinnedStore.getState().pinnedGroups.find((p) => p.id === pg.id)
  if (!after?.activeGroupId) {
    throw new Error(`Launching "${pg.name}" spawned no sessions — check that its directories exist`)
  }
  return {
    pinnedId: pg.id,
    groupId: after.activeGroupId,
    status: stateBefore === 'idle' ? 'launched' : 'shown'
  }
}

function handleCreateGroup(payload: {
  name: string
  workspace?: string
  callerSessionId?: string
}): unknown {
  const store = useSessionStore.getState()
  store.createGroup([], payload.name, workspaceForSpawn(payload.workspace, payload.callerSessionId))
  const created = useSessionStore.getState().groups.at(-1)
  if (!created) throw new Error('Group creation failed')
  return { groupId: created.id, name: created.name, workspaceId: created.workspaceId ?? null }
}

/** A session moved into a group joins that group's workspace — a group must
 *  never hold members it can't show. No-op when they already agree. */
function alignSessionToGroupWorkspace(sessionId: string, group: SessionGroup): void {
  const state = useSessionStore.getState()
  const session = state.sessions.find((s) => s.id === sessionId)
  if (!session || (session.workspaceId ?? null) === (group.workspaceId ?? null)) return
  useSessionStore.setState({
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, workspaceId: group.workspaceId } : s
    )
  })
  if (session.sessionType === 'local') {
    void window.electronAPI?.setSessionWorkspace(sessionId, group.workspaceId ?? null)
  }
}

export async function openSessionProgrammatically(payload: {
  cwd: string
  mode?: 'claude' | 'antigravity' | 'gemini' | 'codex' | 'terminal'
  groupId?: string
  name?: string
  dangerous?: boolean
  model?: string
  command?: string
  autoRun?: boolean
  prompt?: string
  workspace?: string
  callerSessionId?: string
}): Promise<unknown> {
  const state = useSessionStore.getState()
  // Resolve the target group before spawning so a bad reference fails cleanly.
  const targetGroup = payload.groupId
    ? resolveGroup(state.groups, payload.groupId, payload.callerSessionId)
    : null

  // Workspace: explicit param > target group's > caller's > active. A session
  // placed into a group must land in that group's workspace either way.
  const workspaceId = payload.workspace
    ? resolveWorkspace(payload.workspace).id
    : (targetGroup?.workspaceId ?? workspaceForSpawn(undefined, payload.callerSessionId))

  const mode = payload.mode ?? 'claude'
  const claudeMode = mode === 'claude'
  // 'gemini' is accepted as a deprecated alias for the retired Gemini CLI.
  const antigravityMode = mode === 'antigravity' || mode === 'gemini'
  const codexMode = mode === 'codex'
  // --dangerously-skip-permissions is a claude flag; other providers ignore it.
  const dangerousMode = claudeMode && payload.dangerous === true
  // model maps to claude --model / codex -m; antigravity and terminals have no flag.
  const model = (claudeMode || codexMode) && payload.model ? payload.model : undefined
  const info = await window.electronAPI.spawnSession(payload.cwd, {
    claudeMode,
    antigravityMode,
    codexMode,
    dangerousMode,
    model,
    initialCommand: mode === 'terminal' ? payload.command || undefined : undefined,
    autoExecute: mode === 'terminal' && !!payload.command && payload.autoRun !== false,
    initialPrompt: mode !== 'terminal' ? payload.prompt || undefined : undefined,
    workspaceId
  })

  state.addSession({
    id: info.id,
    cwd: info.cwd,
    folderName: info.folderName,
    name: info.folderName,
    alive: info.alive,
    activityStatus: 'idle',
    promptWaiting: null,
    claudeMode,
    antigravityMode,
    codexMode,
    claudeAgentsMode: false,
    dangerousMode,
    model,
    // Parent link for clave_send_to_session/"parent" — only set when the open
    // came from inside another tab (agent delegation), not from the app UI.
    spawnedBy: payload.callerSessionId || undefined,
    claudeSessionId: info.claudeSessionId ?? null,
    // Persist so Duplicate re-primes the clone with the same prompt.
    initialPrompt: mode !== 'terminal' ? payload.prompt || undefined : undefined,
    sessionType: 'local',
    detectedUrl: null,
    serverStatus: null,
    serverCommand: null,
    hasUnseenActivity: false,
    userRenamed: false,
    planFilePath: null,
    workspaceId
  })
  // renameSession sets userRenamed, protecting the name from auto-title overwrite.
  if (payload.name) useSessionStore.getState().renameSession(info.id, payload.name)
  if (targetGroup) {
    useSessionStore.getState().moveItems([info.id], targetGroup.id, 'inside')
  } else if (groupOfSession(useSessionStore.getState().groups, info.id)) {
    // addSession auto-groups a new tab into the group the USER currently has
    // selected. An agent that didn't ask for a group must not inherit the
    // user's live UI selection, so pull it back to top level (sentinel target
    // → moveItems appends to displayOrder; same trick as moveSession "root").
    useSessionStore.getState().moveItems([info.id], '__clave-mcp-root__', 'after')
  }

  // Agent-delegation spawns are transport events (PRDCT-1568): record them
  // with their launch prompt. UI-originated opens have no caller identity and
  // are the human's own act, not transport — never captured. Terminals are
  // not agents; not captured either.
  if (payload.callerSessionId && mode !== 'terminal') {
    const current = useSessionStore.getState().sessions
    const spawner = current.find((s) => s.id === payload.callerSessionId)
    const spawned = current.find((s) => s.id === info.id)
    if (spawner && spawned) {
      window.electronAPI.captureTabSpawn({
        ts: new Date().toISOString(),
        spawner: captureEndpointOf(spawner, useSessionStore.getState().groups),
        session: captureEndpointOf(spawned, useSessionStore.getState().groups),
        prompt: payload.prompt || null,
        model: model ?? null
      })
    }
  }

  const groups = useSessionStore.getState().groups
  return { sessionId: info.id, groupId: groupOfSession(groups, info.id)?.id ?? null }
}

function handleMoveSession(payload: {
  sessionId: string
  groupId: string
  callerSessionId?: string
}): unknown {
  const state = useSessionStore.getState()
  if (!state.sessions.some((s) => s.id === payload.sessionId)) {
    throw new Error(`No session with id "${payload.sessionId}"`)
  }
  if (payload.groupId === 'root') {
    // A target that matches no group and no session falls through to "append
    // at top level" in moveItems, which is exactly ungrouping. (The session's
    // own id would NOT work: moveItems resolves the target's parent group
    // before detaching, and would re-insert it where it came from.)
    state.moveItems([payload.sessionId], '__clave-mcp-root__', 'after')
  } else {
    const group = resolveGroup(state.groups, payload.groupId, payload.callerSessionId)
    state.moveItems([payload.sessionId], group.id, 'inside')
    alignSessionToGroupWorkspace(payload.sessionId, group)
  }
  const groups = useSessionStore.getState().groups
  return {
    sessionId: payload.sessionId,
    groupId: groupOfSession(groups, payload.sessionId)?.id ?? null
  }
}

async function handleAddGroupTerminal(payload: {
  groupId: string
  command: string
  commandMode?: 'prefill' | 'auto'
  color?: string
  icon?: string
  cwd?: string
  serverUrl?: string
  launch?: boolean
  callerSessionId?: string
}): Promise<unknown> {
  const state = useSessionStore.getState()
  const group = resolveGroup(state.groups, payload.groupId, payload.callerSessionId)
  const commandMode = payload.commandMode ?? 'auto'

  const groupCwd =
    group.cwd ?? state.sessions.find((s) => group.sessionIds.includes(s.id))?.cwd ?? null
  const cwd = payload.cwd ?? groupCwd
  if (!cwd) {
    throw new Error('Group has no working directory — pass an explicit cwd')
  }

  const terminalId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  state.addGroupTerminal(group.id, {
    id: terminalId,
    command: payload.command,
    commandMode,
    color: (payload.color as GroupTerminalConfig['color']) ?? 'green',
    icon: (payload.icon as GroupTerminalConfig['icon']) ?? 'terminal',
    // Per-terminal cwd is stored only when it differs from the group default.
    cwd: payload.cwd && payload.cwd !== groupCwd ? payload.cwd : null,
    serverUrl: payload.serverUrl
  })

  if (payload.launch === false) return { terminalId, groupId: group.id, sessionId: null }

  // Same flow as the sidebar's spawnGroupTerminal: the session is linked to the
  // terminal config (icon click focuses it), not added to the group's tab list.
  const info = await window.electronAPI.spawnSession(cwd, {
    claudeMode: false,
    initialCommand: payload.command || undefined,
    autoExecute: !!payload.command && commandMode === 'auto',
    // Group terminals live in their group's workspace, not the active one.
    workspaceId: group.workspaceId ?? undefined
  })
  const current = useSessionStore.getState()
  useSessionStore.setState({
    sessions: [
      ...current.sessions,
      {
        id: info.id,
        cwd: info.cwd,
        folderName: info.folderName,
        name: info.folderName,
        alive: info.alive,
        activityStatus: 'idle' as const,
        promptWaiting: null,
        claudeMode: false,
        antigravityMode: false,
        codexMode: false,
        dangerousMode: false,
        claudeSessionId: info.claudeSessionId ?? null,
        sessionType: 'local' as const,
        detectedUrl: null,
        serverStatus: null,
        serverCommand: null,
        hasUnseenActivity: false,
        userRenamed: false,
        planFilePath: null,
        workspaceId: group.workspaceId
      }
    ],
    // Focus only when the group's workspace is the visible one — a terminal
    // added to a hidden workspace's group must not steal the user's view.
    ...(inActiveWorkspace({ workspaceId: group.workspaceId }, useWorkspaceStore.getState().activeWorkspaceId)
      ? { selectedSessionIds: [info.id], focusedSessionId: info.id }
      : {})
  })
  current.setGroupTerminalSessionId(group.id, terminalId, info.id)
  return { terminalId, groupId: group.id, sessionId: info.id }
}

async function handleCloseSession(payload: {
  sessionId: string
  callerSessionId?: string
}): Promise<unknown> {
  const state = useSessionStore.getState()
  const session = state.sessions.find((s) => s.id === payload.sessionId)
  if (!session) throw new Error(`No session with id "${payload.sessionId}"`)
  // An agent-initiated close is a transport event: recorded with the closing
  // tab as `closer` BEFORE the kill, while the identity is still in the store.
  const closer = payload.callerSessionId
    ? (state.sessions.find((s) => s.id === payload.callerSessionId) ?? null)
    : null
  emitTabClosed(session, state.groups, 'agent', closer)
  await window.electronAPI.killSession(payload.sessionId)
  useSessionStore.getState().removeSession(payload.sessionId)
  return { closed: payload.sessionId }
}

function handleRename(payload: { target: 'group' | 'session'; id: string; name: string }): unknown {
  const state = useSessionStore.getState()
  if (payload.target === 'group') {
    if (!state.groups.some((g) => g.id === payload.id)) {
      throw new Error(`No group with id "${payload.id}"`)
    }
    state.renameGroup(payload.id, payload.name)
  } else {
    if (!state.sessions.some((s) => s.id === payload.id)) {
      throw new Error(`No session with id "${payload.id}"`)
    }
    state.renameSession(payload.id, payload.name)
  }
  return { renamed: payload.id, name: payload.name }
}

/** Collapse '.' and '..' segments of an absolute path (no node:path in the renderer). */
function normalizePath(absPath: string): string {
  const segments: string[] = []
  for (const segment of absPath.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return '/' + segments.join('/')
}

async function handleOpenFile(payload: {
  path: string
  name?: string
  callerSessionId?: string
}): Promise<unknown> {
  const state = useSessionStore.getState()
  let abs = payload.path
  if (!abs.startsWith('/')) {
    const caller = state.sessions.find((s) => s.id === payload.callerSessionId)
    if (!caller) {
      throw new Error(
        'A relative path requires the call to come from inside a Clave tab — pass an absolute path'
      )
    }
    abs = `${caller.cwd}/${abs}`
  }
  abs = normalizePath(abs)
  const slash = abs.lastIndexOf('/')
  const parentDir = abs.substring(0, slash) || '/'
  const fileName = abs.substring(slash + 1)

  let stat: { type: 'file' | 'directory' }
  try {
    stat = await window.electronAPI.statFile(parentDir, fileName)
  } catch {
    throw new Error(`No file at "${abs}"`)
  }
  if (stat.type === 'directory') {
    throw new Error(`"${abs}" is a directory — clave_open_file opens files only`)
  }

  // addFileTab dedups by path: an already-open file just gets focused.
  state.addFileTab({
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    filePath: abs,
    name: payload.name ?? fileName
  })
  const tab = useSessionStore.getState().fileTabs.find((f) => fileTabDedupKey(f) === `file:${abs}`)
  return { fileTabId: tab?.id ?? null, filePath: abs }
}

async function handleNotify(payload: {
  title: string
  body: string
  sessionId?: string
  callerSessionId?: string
}): Promise<unknown> {
  const state = useSessionStore.getState()
  if (payload.sessionId && !state.sessions.some((s) => s.id === payload.sessionId)) {
    throw new Error(`No session with id "${payload.sessionId}"`)
  }
  const sessionId = payload.sessionId ?? payload.callerSessionId
  if (!sessionId) {
    throw new Error('Pass sessionId — this call did not come from inside a Clave tab')
  }
  const status = await window.electronAPI.showNotification({
    title: payload.title,
    body: payload.body,
    sessionId
  })
  return { status, sessionId }
}

/** Resolve a messaging/readback target: a session id, an exact tab name, or
 *  "parent" (the tab whose agent opened the caller via clave_open_session). */
function resolveTargetSession(ref: string, callerSessionId: string | undefined): Session {
  const sessions = useSessionStore.getState().sessions.filter((s) => s.sessionType === 'local')
  if (ref === 'parent') {
    if (!callerSessionId) {
      throw new Error('Target "parent" requires the call to come from inside a Clave session')
    }
    const caller = sessions.find((s) => s.id === callerSessionId)
    const parent = caller?.spawnedBy
      ? sessions.find((s) => s.id === caller.spawnedBy)
      : undefined
    if (!parent) {
      throw new Error(
        'This session has no live parent — only tabs opened via clave_open_session know their opener, and the link does not survive an app restart. Use clave_list and target a session id or name instead.'
      )
    }
    return parent
  }
  const found = sessions.find((s) => s.id === ref) ?? sessions.find((s) => s.name === ref)
  if (!found) throw new Error(`No session with id or name "${ref}"`)
  return found
}

/**
 * Cross-tab reach gate: a tab may send to / read only a target it has a real
 * relationship with — one it opened, the one that opened it ("parent"), or one
 * the user placed in the same group. This keeps a single poisoned tab from
 * driving or reading tabs in unrelated projects; grouping is the explicit
 * "these tabs may talk" gesture for anything outside the spawn lineage.
 * Identity is the token-derived callerSessionId (unforgeable), so the gate is
 * enforceable — a tab cannot claim to be the target's parent.
 */
function assertCanReach(
  callerSessionId: string | undefined,
  target: Session,
  verb: 'message' | 'read'
): void {
  const state = useSessionStore.getState()
  const caller = callerSessionId
    ? state.sessions.find((s) => s.id === callerSessionId)
    : undefined
  if (!caller) {
    throw new Error(
      `clave_${verb === 'message' ? 'send_to' : 'read'}_session must be called from inside a Clave agent tab — this request has no tab identity.`
    )
  }
  if (caller.id === target.id) return
  const related =
    target.id === caller.spawnedBy || // target opened me (my parent)
    target.spawnedBy === caller.id || // I opened target (my child)
    state.groups.some(
      (g) => g.sessionIds.includes(caller.id) && g.sessionIds.includes(target.id)
    )
  if (!related) {
    throw new Error(
      `Refusing to ${verb} tab "${target.name}": it is not related to yours. You can only reach the tab that opened yours ("parent"), tabs you opened, or tabs in the same group. Put both tabs in one group to allow this.`
    )
  }
}

/**
 * Strip control bytes that would break the bracketed-paste envelope or be
 * interpreted as keystrokes/escape sequences by the receiving TUI. Newlines
 * and tabs are safe *inside* a paste and kept; everything else below 0x20
 * (plus DEL) is removed. This is the load-bearing guard against paste
 * breakout: without removing ESC (0x1b), a literal `\x1b[201~` in the message
 * would close the paste early and turn the remainder into live keystrokes —
 * enough to clear the input and enter Claude's `!` bash mode (RCE across
 * tabs). With ESC/CR/etc. gone, the whole message stays pasted text under the
 * provenance header and our single trailing submit sends it as one turn.
 */
function sanitizeForPaste(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
}

// Serialize writes per target so two concurrent sends can't interleave their
// paste envelopes (envelope-A, envelope-B, submit-A, submit-B → one garbled
// turn). Keyed by target session id; each send appends to the target's chain.
const sendChains = new Map<string, Promise<unknown>>()

async function handleSendToSession(payload: {
  sessionId: string
  message: string
  callerSessionId?: string
}): Promise<unknown> {
  const target = resolveTargetSession(payload.sessionId, payload.callerSessionId)
  if (payload.callerSessionId && target.id === payload.callerSessionId) {
    throw new Error('Refusing to send a message to your own session')
  }
  assertCanReach(payload.callerSessionId, target, 'message')
  if (!target.alive) throw new Error(`Session "${target.name}" has ended`)
  const mode = sessionMode(target)
  if (mode === 'terminal') {
    throw new Error(
      'Refusing to send to a plain terminal — text typed there would run as a shell command. Target an agent tab (claude/antigravity/codex).'
    )
  }
  if (mode === 'claude-agents') {
    throw new Error('Refusing to send to a `claude agents` tab — it is a menu UI, not a chat input')
  }
  const sender = payload.callerSessionId
    ? useSessionStore.getState().sessions.find((s) => s.id === payload.callerSessionId)
    : undefined
  // Provenance header: the receiving agent must be able to tell this text came
  // from a sibling tab, not from the user — and know how to answer it. Built
  // from the shared module so the capture's transcript parser matches the same
  // string it stamps here (a drifted copy would silently relabel a sibling's
  // message as the human's).
  const header = buildProvenanceHeader(sender)
  // Sanitize BOTH parts (header + message): a tab renamed to carry control
  // bytes must not be able to smuggle them in via the header either. Parts
  // are sanitized separately (the per-character filter distributes over
  // concatenation, so this equals sanitizing the joined text) so the capture
  // below can record exactly what was delivered under which provenance.
  const cleanHeader = sanitizeForPaste(header)
  const cleanMessage = sanitizeForPaste(payload.message)
  const text = `${cleanHeader}\n${cleanMessage}`

  const targetId = target.id

  // Set once the SUBMIT below has landed — the moment the message exists in
  // the target. The capture (see the chain wiring) keys off this and NOT off
  // the draft restore that follows, so a failed or best-effort restore can
  // neither suppress the record nor change `delivered`.
  let submitted = false

  // PRDCT-1569: the target CLI's input buffer may hold the user's half-typed
  // draft, which would otherwise be co-submitted with (and swallowed by) the
  // injected turn. Stash the tracked draft, clear the input line, deliver
  // header+message and submit ALONE, then restore the draft unsubmitted.
  // The whole sequence lives inside one per-target chain link so a concurrent
  // send cannot interleave with the restore.
  //
  // Degraded-case stance: when the shadow's tracking confidence is lost
  // (word ops, history recall, completions, dialog input…) we still deliver —
  // never hold the message on screen-scraping the TUI — clearing with a
  // cushioned overshoot built only from keys verified inert both at the input
  // boundary and inside the CLI's dialogs (see draft-shadow.ts; undershoot
  // would leave residue to co-submit). The degradation is reported ONLY in
  // this tool's result (draftHandling) — nothing in the app UI shows it.
  const runInjection = async (): Promise<DraftStash> => {
    const shadow = getDraftShadow(targetId)
    const stash = shadow.beginInjection()
    try {
      if (stash.clear) {
        window.electronAPI.writeSession(targetId, stash.clear)
        await new Promise((r) => setTimeout(r, 150))
      }
      // Deliver as one bracketed paste so embedded newlines don't submit early,
      // then submit. The TUI queues input that arrives mid-turn, so a busy agent
      // sees the message as its next user turn.
      window.electronAPI.writeSession(targetId, `\x1b[200~${text}\x1b[201~`)
      await new Promise((r) => setTimeout(r, 150))
      window.electronAPI.writeSession(targetId, '\r')
      submitted = true
      if (stash.text) {
        // Give the TUI a beat to consume the submit, then re-paste the draft
        // with NO trailing submit — same sanitize + bracketed-paste discipline
        // as the message itself (the draft is user text, not keystrokes).
        await new Promise((r) => setTimeout(r, 150))
        window.electronAPI.writeSession(
          targetId,
          `\x1b[200~${sanitizeForPaste(stash.text)}\x1b[201~`
        )
      }
    } finally {
      shadow.endInjection(stash.text)
    }
    return stash
  }

  const prior = sendChains.get(targetId) ?? Promise.resolve()
  const run = prior.catch(() => {}).then(runInjection)
  sendChains.set(targetId, run)
  run.finally(() => {
    // Drop the chain once it drains so the map doesn't grow unboundedly.
    if (sendChains.get(targetId) === run) sendChains.delete(targetId)
  })
  // Transport-layer capture (PRDCT-1568), on a chain of its own so the delivery
  // never waits on it: it records the message once the submit has landed, and
  // fires on BOTH settle paths — a restore that failed still delivered a
  // message, and the record must show that. Fire-and-forget IPC, off the
  // stash->restore critical path. `sender` is always set here: assertCanReach
  // refused identity-less callers above.
  if (sender) {
    const recordDelivery = (): void => {
      if (!submitted) return
      window.electronAPI.captureExchangeMessage({
        ts: new Date().toISOString(),
        sender: captureEndpointOf(sender, useSessionStore.getState().groups),
        target: captureEndpointOf(target, useSessionStore.getState().groups),
        text: cleanMessage,
        provenance: cleanHeader,
        delivered:
          useSessionStore.getState().sessions.find((s) => s.id === targetId)?.alive === true
      })
    }
    void run.then(recordDelivery, recordDelivery)
  }
  const stash = await run

  // The target can exit during the 150ms envelope→submit gap; the PTY write is
  // then a silent no-op, so report what actually happened rather than a blanket
  // delivered:true.
  const stillAlive = useSessionStore.getState().sessions.find((s) => s.id === targetId)?.alive === true
  if (stillAlive) {
    // Visible, non-spoofable signal that a sibling wrote here — the sidebar
    // marks the tab and names the sender, so a cross-tab message is never
    // silent even if the user isn't looking at the target tab.
    const store = useSessionStore.getState()
    store.setSessionInjectedFrom(targetId, sender?.name ?? 'another tab')
    if (!store.selectedSessionIds.includes(targetId)) store.setSessionUnseenActivity(targetId, true)
  }
  // How the user's pending input draft was handled: 'none' (input believed
  // empty, nothing touched), 'stashed-restored' (draft cleared before the
  // injected turn and re-pasted unsubmitted after it), or the best-effort
  // variant when keystroke tracking had lost confidence.
  const draftHandling = stash.confident
    ? stash.text
      ? 'stashed-restored'
      : 'none'
    : 'stashed-restored-best-effort'
  return {
    delivered: stillAlive,
    sessionId: targetId,
    name: target.name,
    mode,
    agentState: target.agentState ?? null,
    draftHandling
  }
}

function handleReadSession(payload: {
  sessionId: string
  lines?: number
  callerSessionId?: string
}): unknown {
  const target = resolveTargetSession(payload.sessionId, payload.callerSessionId)
  assertCanReach(payload.callerSessionId, target, 'read')
  const terminal = getRegisteredTerminal(target.id)
  if (!terminal) {
    throw new Error(`Session "${target.name}" has no terminal buffer (tab not mounted yet)`)
  }
  const requested = Math.min(Math.max(payload.lines ?? 100, 1), 500)
  const buffer = terminal.buffer.active
  const lines: string[] = []
  for (let i = Math.max(0, buffer.length - requested); i < buffer.length; i++) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
  }
  // The TUI viewport is mostly blank padding — drop trailing empty rows.
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  return {
    sessionId: target.id,
    name: target.name,
    mode: sessionMode(target),
    alive: target.alive,
    agentState: target.agentState ?? null,
    lines: lines.length,
    text: lines.join('\n')
  }
}

function handleFocus(payload: { sessionId: string }): unknown {
  const state = useSessionStore.getState()
  const target = state.sessions.find((s) => s.id === payload.sessionId)
  if (!target) {
    throw new Error(`No session with id "${payload.sessionId}"`)
  }
  // An explicit focus request must be honored VISIBLY: focusing a session in a
  // hidden workspace switches the whole view to that workspace first.
  const activeId = useWorkspaceStore.getState().activeWorkspaceId
  if (target.workspaceId && activeId && target.workspaceId !== activeId) {
    void setActiveWorkspace(target.workspaceId)
  }
  useSessionStore.getState().selectSession(payload.sessionId, false)
  return { focused: payload.sessionId, workspaceId: target.workspaceId ?? null }
}

function handleSwitchWorkspace(payload: { workspace: string }): unknown {
  const ws = resolveWorkspace(payload.workspace)
  void setActiveWorkspace(ws.id)
  return { activeWorkspaceId: ws.id, name: ws.name }
}

async function execute(command: string, payload: unknown): Promise<unknown> {
  switch (command) {
    case 'list':
      return handleList(payload as Parameters<typeof handleList>[0])
    case 'createGroup':
      return handleCreateGroup(payload as Parameters<typeof handleCreateGroup>[0])
    case 'openSession':
      return openSessionProgrammatically(
        payload as Parameters<typeof openSessionProgrammatically>[0]
      )
    case 'moveSession':
      return handleMoveSession(payload as Parameters<typeof handleMoveSession>[0])
    case 'launchGroup':
      return handleLaunchGroup(payload as Parameters<typeof handleLaunchGroup>[0])
    case 'addGroupTerminal':
      return handleAddGroupTerminal(payload as Parameters<typeof handleAddGroupTerminal>[0])
    case 'closeSession':
      return handleCloseSession(payload as Parameters<typeof handleCloseSession>[0])
    case 'rename':
      return handleRename(payload as Parameters<typeof handleRename>[0])
    case 'focus':
      return handleFocus(payload as Parameters<typeof handleFocus>[0])
    case 'switchWorkspace':
      return handleSwitchWorkspace(payload as Parameters<typeof handleSwitchWorkspace>[0])
    case 'sendToSession':
      return handleSendToSession(payload as Parameters<typeof handleSendToSession>[0])
    case 'readSession':
      return handleReadSession(payload as Parameters<typeof handleReadSession>[0])
    case 'openFile':
      return handleOpenFile(payload as Parameters<typeof handleOpenFile>[0])
    case 'notify':
      return handleNotify(payload as Parameters<typeof handleNotify>[0])
    default:
      throw new Error(`Unknown MCP command "${command}"`)
  }
}

/** Subscribe to MCP commands from the main process. Returns an unsubscribe fn. */
export function initMcpDispatcher(): () => void {
  return window.electronAPI.onMcpCommand((msg: McpCommandMessage) => {
    void (async () => {
      try {
        const result = await execute(msg.command, msg.payload)
        window.electronAPI.mcpRespond({ requestId: msg.requestId, ok: true, result })
      } catch (err) {
        window.electronAPI.mcpRespond({
          requestId: msg.requestId,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    })()
  })
}

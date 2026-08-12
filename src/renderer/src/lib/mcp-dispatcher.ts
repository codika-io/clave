import { useSessionStore, fileTabDedupKey } from '../store/session-store'
import type { GroupTerminalConfig, Session, SessionGroup } from '../store/session-store'
import { usePinnedStore, getPinnedState, togglePinnedGroup } from '../store/pinned-store'
import type { PinnedGroupSession } from '../store/session-types'
import { getRegisteredTerminal } from './terminal-registry'

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

type SessionMode = 'claude' | 'antigravity' | 'codex' | 'claude-agents' | 'terminal'

function sessionMode(s: Session): SessionMode {
  if (s.antigravityMode) return 'antigravity'
  if (s.codexMode) return 'codex'
  if (s.claudeAgentsMode) return 'claude-agents'
  if (s.claudeMode) return 'claude'
  return 'terminal'
}

function groupOfSession(groups: SessionGroup[], sessionId: string): SessionGroup | undefined {
  return groups.find((g) => g.sessionIds.includes(sessionId))
}

/** Resolve a tool's group reference: a group id, an exact group name, or "mine". */
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
  const group = groups.find((g) => g.id === ref) ?? groups.find((g) => g.name === ref)
  if (!group) throw new Error(`No group with id or name "${ref}"`)
  return group
}

function handleList(payload: { callerSessionId?: string }): unknown {
  const state = useSessionStore.getState()
  const sessions = state.sessions
    .filter((s) => s.sessionType === 'local')
    .map((s) => ({
      id: s.id,
      name: s.name,
      cwd: s.cwd,
      mode: sessionMode(s),
      alive: s.alive,
      agentState: s.agentState ?? null,
      groupId: groupOfSession(state.groups, s.id)?.id ?? null
    }))
  const groups = state.groups.map((g) => ({
    id: g.id,
    name: g.name,
    cwd: g.cwd,
    color: g.color ?? null,
    sessionIds: g.sessionIds,
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
  const pinnedGroups = usePinnedStore.getState().pinnedGroups.map((pg) => ({
    id: pg.id,
    name: pg.name,
    cwd: pg.cwd,
    category: pg.category ?? null,
    sourceFile: pg.filePath ?? pg.discoveredBy ?? null,
    state: getPinnedState(pg),
    activeGroupId: pg.activeGroupId,
    sessions: pg.sessions.map((s) => ({ name: s.name, cwd: s.cwd, mode: pinnedSessionMode(s) })),
    terminals: pg.terminals.map((t) => ({ command: t.command, commandMode: t.commandMode }))
  }))
  const callerSessionId = payload.callerSessionId ?? null
  return {
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

async function handleLaunchGroup(payload: { group: string }): Promise<unknown> {
  const pinnedGroups = usePinnedStore.getState().pinnedGroups
  const pg =
    pinnedGroups.find((p) => p.id === payload.group) ??
    pinnedGroups.find((p) => p.name === payload.group) ??
    pinnedGroups.find((p) => p.name.toLowerCase() === payload.group.toLowerCase())
  if (!pg) {
    const available = pinnedGroups.map((p) => p.name).join(', ') || '(none)'
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

function handleCreateGroup(payload: { name: string }): unknown {
  const store = useSessionStore.getState()
  store.createGroup([], payload.name)
  const created = useSessionStore.getState().groups.at(-1)
  if (!created) throw new Error('Group creation failed')
  return { groupId: created.id, name: created.name }
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
  callerSessionId?: string
}): Promise<unknown> {
  const state = useSessionStore.getState()
  // Resolve the target group before spawning so a bad reference fails cleanly.
  const targetGroup = payload.groupId
    ? resolveGroup(state.groups, payload.groupId, payload.callerSessionId)
    : null

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
    initialPrompt: mode !== 'terminal' ? payload.prompt || undefined : undefined
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
    planFilePath: null
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
    autoExecute: !!payload.command && commandMode === 'auto'
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
        planFilePath: null
      }
    ],
    selectedSessionIds: [info.id],
    focusedSessionId: info.id
  })
  current.setGroupTerminalSessionId(group.id, terminalId, info.id)
  return { terminalId, groupId: group.id, sessionId: info.id }
}

async function handleCloseSession(payload: { sessionId: string }): Promise<unknown> {
  const state = useSessionStore.getState()
  const session = state.sessions.find((s) => s.id === payload.sessionId)
  if (!session) throw new Error(`No session with id "${payload.sessionId}"`)
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
  // from a sibling tab, not from the user — and know how to answer it.
  const header = sender
    ? `[Message from Clave tab "${sender.name}" — reply with clave_send_to_session sessionId="${sender.id}"]`
    : '[Message from a Clave agent]'
  // Sanitize the WHOLE payload (header + message): a tab renamed to carry
  // control bytes must not be able to smuggle them in via the header either.
  const text = sanitizeForPaste(`${header}\n${payload.message}`)

  const targetId = target.id
  const prior = sendChains.get(targetId) ?? Promise.resolve()
  const run = prior.catch(() => {}).then(async () => {
    // Deliver as one bracketed paste so embedded newlines don't submit early,
    // then submit. The TUI queues input that arrives mid-turn, so a busy agent
    // sees the message as its next user turn.
    window.electronAPI.writeSession(targetId, `\x1b[200~${text}\x1b[201~`)
    await new Promise((r) => setTimeout(r, 150))
    window.electronAPI.writeSession(targetId, '\r')
  })
  sendChains.set(targetId, run)
  run.finally(() => {
    // Drop the chain once it drains so the map doesn't grow unboundedly.
    if (sendChains.get(targetId) === run) sendChains.delete(targetId)
  })
  await run

  // The target can exit during the 150ms envelope→submit gap; the PTY write is
  // then a silent no-op, so report what actually happened rather than a blanket
  // delivered:true.
  const stillAlive = useSessionStore.getState().sessions.find((s) => s.id === targetId)?.alive === true
  return {
    delivered: stillAlive,
    sessionId: targetId,
    name: target.name,
    mode,
    agentState: target.agentState ?? null
  }
}

function handleReadSession(payload: {
  sessionId: string
  lines?: number
  callerSessionId?: string
}): unknown {
  const target = resolveTargetSession(payload.sessionId, payload.callerSessionId)
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
  if (!state.sessions.some((s) => s.id === payload.sessionId)) {
    throw new Error(`No session with id "${payload.sessionId}"`)
  }
  state.selectSession(payload.sessionId, false)
  return { focused: payload.sessionId }
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

import { useSessionStore } from '../store/session-store'
import type { GroupTerminalConfig, Session, SessionGroup } from '../store/session-store'

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

type SessionMode = 'claude' | 'gemini' | 'codex' | 'claude-agents' | 'terminal'

function sessionMode(s: Session): SessionMode {
  if (s.geminiMode) return 'gemini'
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
      sessionId: t.sessionId
    }))
  }))
  const callerSessionId = payload.callerSessionId ?? null
  return {
    groups,
    sessions,
    focusedSessionId: state.focusedSessionId,
    callerSessionId,
    callerGroupId: callerSessionId
      ? (groupOfSession(state.groups, callerSessionId)?.id ?? null)
      : null
  }
}

function handleCreateGroup(payload: { name: string }): unknown {
  const store = useSessionStore.getState()
  store.createGroup([], payload.name)
  const created = useSessionStore.getState().groups.at(-1)
  if (!created) throw new Error('Group creation failed')
  return { groupId: created.id, name: created.name }
}

async function handleOpenSession(payload: {
  cwd: string
  mode?: 'claude' | 'gemini' | 'codex' | 'terminal'
  groupId?: string
  name?: string
  dangerous?: boolean
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
  const geminiMode = mode === 'gemini'
  const codexMode = mode === 'codex'
  // --dangerously-skip-permissions is a claude flag; other providers ignore it.
  const dangerousMode = claudeMode && payload.dangerous === true
  const info = await window.electronAPI.spawnSession(payload.cwd, {
    claudeMode,
    geminiMode,
    codexMode,
    dangerousMode,
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
    geminiMode,
    codexMode,
    claudeAgentsMode: false,
    dangerousMode,
    claudeSessionId: info.claudeSessionId ?? null,
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
  if (targetGroup) useSessionStore.getState().moveItems([info.id], targetGroup.id, 'inside')

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
    cwd: payload.cwd && payload.cwd !== groupCwd ? payload.cwd : null
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
        geminiMode: false,
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
      return handleOpenSession(payload as Parameters<typeof handleOpenSession>[0])
    case 'moveSession':
      return handleMoveSession(payload as Parameters<typeof handleMoveSession>[0])
    case 'addGroupTerminal':
      return handleAddGroupTerminal(payload as Parameters<typeof handleAddGroupTerminal>[0])
    case 'closeSession':
      return handleCloseSession(payload as Parameters<typeof handleCloseSession>[0])
    case 'rename':
      return handleRename(payload as Parameters<typeof handleRename>[0])
    case 'focus':
      return handleFocus(payload as Parameters<typeof handleFocus>[0])
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

/**
 * The `.clave` TRUST BOUNDARY, and the file shape it operates on.
 *
 * A `.clave` file can act the moment it is opened: run commands without asking,
 * launch agents with permissions disabled, and auto-submit a prompt that sets an
 * agent working. For a file the user has not trusted, Clave shows a review
 * dialog listing exactly what would run, and "Open safely" strips those powers.
 *
 * `describeElevated` decides what that dialog discloses; `sanitizeElevated`
 * decides what survives "Open safely". Both enumerate fields by hand, so EVERY
 * new `.clave` field that can drive an agent must be added to both or it
 * silently bypasses the gate — a failure with no symptom, which is why this
 * module is deliberately free of Electron imports and covered by
 * `clave-trust-boundary.test.ts` rather than only by the running app.
 */

export interface ClaveGroupData {
  name: string
  cwd: string
  color: string | null
  toolbar?: boolean
  category?: string
  logo?: string
  /** Group-level default prompt. Sessions launched from the group's own `+`
   *  inherit it; a session's own `prompt` still wins for that session. Same
   *  @-token vocabulary as a session prompt, substituted at spawn. */
  prompt?: string
  sessions: { cwd: string; name: string; claudeMode: boolean; antigravityMode: boolean; codexMode: boolean; claudeAgentsMode?: boolean; dangerousMode: boolean; prompt?: string; rootSession?: boolean; /** @deprecated legacy alias for antigravityMode, read for back-compat */ geminiMode?: boolean }[]
  terminals: { command: string; commandMode: 'prefill' | 'auto'; color: string; icon?: string; cwd?: string; autoLaunchLocalhost?: boolean; persistent?: boolean; serverUrl?: string }[]
}

export type ClaveFileReadResult =
  | ({ type: 'single' } & ClaveGroupData)
  | { type: 'multi'; groups: ClaveGroupData[] }


/** Auto-run commands, auto-submitted agent prompts, or dangerousMode sessions
 *  present in a parsed result — anything that acts on launch without user input. */
export function describeElevated(result: ClaveFileReadResult): { autoCommands: string[]; prompts: string[]; dangerous: boolean } {
  const groups = result.type === 'multi' ? result.groups : [result]
  const autoCommands: string[] = []
  const prompts: string[] = []
  let dangerous = false
  for (const g of groups) {
    for (const t of g.terminals) {
      if (t.commandMode === 'auto' && t.command.trim()) autoCommands.push(t.command)
    }
    // A group-level prompt is auto-submitted to every session the group's `+`
    // launches, so it is elevated for exactly the same reason a session prompt is.
    if (g.prompt && g.prompt.trim()) prompts.push(g.prompt)
    for (const s of g.sessions) {
      if (s.dangerousMode) dangerous = true
      if (s.prompt && s.prompt.trim()) prompts.push(s.prompt)
    }
  }
  return { autoCommands, prompts, dangerous }
}

/** Strip elevated behavior: downgrade auto→prefill, disable dangerousMode, and
 *  drop auto-submitted prompts (an untrusted file must not drive the agent). */
export function sanitizeElevated(result: ClaveFileReadResult): ClaveFileReadResult {
  const sanitizeGroup = (g: ClaveGroupData): ClaveGroupData => ({
    ...g,
    prompt: undefined,
    sessions: g.sessions.map((s) => ({ ...s, dangerousMode: false, prompt: undefined })),
    terminals: g.terminals.map((t) => (t.commandMode === 'auto' ? { ...t, commandMode: 'prefill' } : t))
  })
  if (result.type === 'multi') {
    return { type: 'multi', groups: result.groups.map(sanitizeGroup) }
  }
  return { type: 'single', ...sanitizeGroup(result) }
}

import * as http from 'http'
import * as path from 'path'
import { createHash, timingSafeEqual } from 'crypto'
import { app } from 'electron'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { callRenderer, registerMcpBridge } from './mcp-bridge'
import {
  loadOrCreateServerState,
  saveServerState,
  setMcpRuntime,
  resolveSessionByToken,
  rebuildSessionTokens
} from './mcp-runtime'
import {
  createRequest,
  getRequest,
  waitForOutcome,
  type SecretAction,
  type SecretRequest
} from '../secret-request-manager'
import { createOffer } from '../copy-offer-manager'
import { queryExchanges } from '../exchange-capture/service'
import type { ResolvedExchangeScope } from '../exchange-capture/types'

const MCP_PATH = '/mcp'

const INSTRUCTIONS = `You are running inside Clave, a desktop app that manages multiple agent sessions as tabs organized into groups in a sidebar. You are one of those tabs. Tabs, groups, and pinned templates belong to WORKSPACES (root folders like ~/company); exactly one workspace is active and is all the user sees — other workspaces' sessions keep running hidden. Things you open default to your own tab's workspace; pass the workspace parameter to open work elsewhere without switching the user's view, and clave_switch_workspace only when the user should look at it. The clave_* tools let you manipulate the app around you: list the current tabs and groups, open sibling tabs (claude, antigravity, codex, or a plain terminal, in any directory — optionally with an initial prompt and a model choice, so you can delegate a task to a fresh agent), create groups, move tabs between groups, attach quick-launch terminals to a group (a saved command like a dev server, run on click or immediately), launch pinned workspace groups (whole-group templates defined in .clave files — clave_list shows which exist), rename, focus, or close tabs, open a file as a tab for the user to read (clave_open_file), and notify the user with a native notification when long-running work finishes (clave_notify). Tabs can also talk to each other: clave_send_to_session delivers a message into another agent tab's input (target "parent" to report back to the tab that opened yours — messages you receive this way carry a provenance header and come from a sibling agent, not the user), and clave_read_session reads the last lines of any tab's terminal without interrupting it (a delegate's progress, a dev server's logs). Clave also records the transport layer it mediates — cross-tab message deliveries with both endpoints' token usage, agent tab spawns, Task-subagent fan-outs — and clave_read_exchanges queries that capture for your group or a related session: the event timeline, current token usage, or each session's human-layer conversation with operations stripped. Pass groupId "mine" to target the group your own tab lives in. When a task would benefit from a parallel session — a dev server, a long build, a second agent working on another part of the codebase — offer to open one with clave_open_session or clave_add_group_terminal instead of running it inline. When you need a sensitive value from the user (an API key, a token, a .env entry), NEVER ask them to paste it in the chat — call clave_request_secret instead: the user supplies it privately in the app and the value never enters this conversation. The reverse also has a tool: when the user needs to copy something you produced (a command for another machine, a config snippet, a message to paste elsewhere), call clave_offer_copy instead of printing it for terminal selection — a copy button appears in your tab's header and one click puts the exact bytes on their clipboard, formatting intact.`

let httpServer: http.Server | null = null
let serverToken: string | null = null

/**
 * Authenticate a request and, crucially, DERIVE the caller's tab identity from
 * the presented token — never from a client-supplied header. A per-session
 * token maps to exactly one tab (that tab can't forge another's identity); the
 * shared discovery token authenticates but stays anonymous (no tab identity,
 * so the identity-gated tools refuse it).
 */
function authenticate(authHeader: string | undefined): { ok: boolean; callerSessionId?: string } {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false }
  const presented = authHeader.slice('Bearer '.length)
  const sessionId = resolveSessionByToken(presented)
  if (sessionId) return { ok: true, callerSessionId: sessionId }
  if (serverToken) {
    // Hash both sides so timingSafeEqual gets equal-length buffers.
    const a = createHash('sha256').update(presented).digest()
    const b = createHash('sha256').update(serverToken).digest()
    if (timingSafeEqual(a, b)) return { ok: true }
  }
  return { ok: false }
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
      } catch (err) {
        reject(err as Error)
      }
    })
    req.on('error', reject)
  })
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** Run a renderer command and wrap the outcome as an MCP tool result. */
async function runCommand(command: string, payload: unknown): Promise<ToolResult> {
  try {
    const result = await callRenderer<unknown>(command, payload)
    return { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }) }] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

/**
 * Build a per-request McpServer. Stateless mode: a fresh server + transport
 * per POST keeps request ids isolated and needs no MCP-session bookkeeping.
 * `callerSessionId` is derived server-side from the caller's per-session token
 * (see authenticate) — it identifies which tab is calling and can't be forged.
 */
function buildServer(callerSessionId: string | undefined): McpServer {
  const server = new McpServer(
    { name: 'clave', version: app.getVersion() },
    { instructions: INSTRUCTIONS }
  )

  server.registerTool(
    'clave_list',
    {
      description:
        'List the registered workspaces (root folders; exactly one is active and scopes what the user sees), all groups and sessions (tabs) currently open in Clave, plus the pinned workspace groups (launchable templates from .clave files, with their state: idle / active-visible / active-hidden), the focused session, and — when called from inside a Clave tab — which session/group is yours. Sessions, groups, and pins are annotated with their workspaceId/workspaceName.',
      inputSchema: {
        workspace: z
          .string()
          .optional()
          .describe(
            'Scope the listing: "all" (default), "active", or a workspace id/name. Hidden workspaces\' sessions keep running — "all" shows everything.'
          )
      }
    },
    (args) => runCommand('list', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_create_group',
    {
      description:
        'Create a new (empty) group in the Clave sidebar. Returns the new groupId. Follow up with clave_open_session to put a tab in it — some interactions prune empty groups.',
      inputSchema: {
        name: z.string().describe('Display name for the group'),
        workspace: z
          .string()
          .optional()
          .describe(
            'Workspace (id or name) the group belongs to. Default: your own tab\'s workspace, else the active one.'
          )
      }
    },
    (args) => runCommand('createGroup', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_open_session',
    {
      description:
        'Open a new tab in Clave: a Claude Code, Antigravity CLI, or Codex CLI session, or a plain terminal, in the given directory. Optionally place it in a group — pass a groupId, an exact group name, or "mine" for the calling tab\'s own group. Returns { sessionId, groupId }.',
      inputSchema: {
        cwd: z.string().describe('Absolute path of the working directory for the new session'),
        mode: z
          // 'gemini' is kept as a deprecated alias (the Gemini CLI was retired
          // and folded into Antigravity); it maps to an antigravity session.
          .enum(['claude', 'antigravity', 'gemini', 'codex', 'terminal'])
          .default('claude')
          .describe('Which agent CLI to start, or terminal for a plain shell'),
        groupId: z
          .string()
          .optional()
          .describe('Target group: a group id, an exact group name, or "mine"'),
        name: z.string().optional().describe('Display name for the new tab'),
        dangerous: z
          .boolean()
          .optional()
          .describe('Start claude with --dangerously-skip-permissions (claude mode only)'),
        model: z
          .string()
          .regex(/^[A-Za-z0-9][A-Za-z0-9._/:-]{0,199}$/)
          .optional()
          .describe(
            'Model the new agent starts on: an alias ("opus", "sonnet", "haiku") or a full model id ("claude-fable-5"). claude and codex modes only; omitted = the CLI\'s default. The user can still switch later with /model inside the tab.'
          ),
        command: z
          .string()
          .optional()
          .describe('Terminal mode only: a shell command to run in the new terminal'),
        autoRun: z
          .boolean()
          .optional()
          .describe(
            'Terminal mode only: execute the command immediately (default true); false just prefills it'
          ),
        prompt: z
          .string()
          .optional()
          .describe('Agent modes only: an initial prompt the agent starts working on immediately'),
        workspace: z
          .string()
          .optional()
          .describe(
            'Workspace (id or name) the new tab belongs to — lets you open work in another workspace WITHOUT switching the user\'s view. Default: the target group\'s workspace, else your own tab\'s, else the active one.'
          )
      }
    },
    (args) => runCommand('openSession', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_launch_group',
    {
      description:
        'Launch a pinned workspace group (a template from a .clave file): spawns all its sessions and attaches its quick-launch terminals as one group. If the group is already running but hidden, it is shown instead. Use clave_list to see the available pinned groups and their state. A name existing in several workspaces resolves to your own workspace first, then the active one; still-ambiguous names error with qualified candidates.',
      inputSchema: {
        group: z.string().describe('Pinned group id or name (case-insensitive)'),
        workspace: z
          .string()
          .optional()
          .describe('Restrict the lookup to one workspace (id or name)')
      }
    },
    (args) => runCommand('launchGroup', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_switch_workspace',
    {
      description:
        'Switch the app\'s ACTIVE workspace — the user\'s whole visible world (sidebar sessions, groups, templates, toolbar) flips to that workspace; hidden workspaces\' sessions keep running. Prefer opening background work with clave_open_session\'s workspace parameter instead; switch only when the user should actually look at the other workspace.',
      inputSchema: {
        workspace: z.string().describe('Workspace id or name to activate')
      }
    },
    (args) => runCommand('switchWorkspace', args)
  )

  server.registerTool(
    'clave_move_session',
    {
      description:
        'Move an existing Clave tab into a group, or out of its group with "root". Use this instead of closing and recreating a session. Note: moving the last tab out of a group deletes that group (including its quick-launch terminal configs).',
      inputSchema: {
        sessionId: z.string().describe('Id of the session to move'),
        groupId: z
          .string()
          .describe(
            'Target: a group id, an exact group name, "mine" for the calling tab\'s group, or "root" to ungroup'
          )
      }
    },
    (args) => runCommand('moveSession', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_add_group_terminal',
    {
      description:
        'Attach a quick-launch terminal to a Clave group: a saved shell command (e.g. a dev server) shown as a colored icon on the group, re-runnable on click. By default it also launches right away. Returns { terminalId, groupId, sessionId }.',
      inputSchema: {
        groupId: z.string().describe('Target group: a group id, an exact group name, or "mine"'),
        command: z.string().describe('Shell command this terminal runs, e.g. "npm run dev"'),
        commandMode: z
          .enum(['prefill', 'auto'])
          .default('auto')
          .describe('auto = run the command on launch; prefill = type it but wait for Enter'),
        color: z
          .enum(['black', 'green', 'teal', 'blue', 'purple', 'yellow', 'pink', 'red'])
          .default('green')
          .describe('Icon color'),
        icon: z
          .enum([
            'terminal',
            'fire',
            'bolt',
            'rocket',
            'eye',
            'globe',
            'cube',
            'heart',
            'star',
            'user',
            'shield',
            'wrench',
            'beaker',
            'cpu',
            'signal',
            'bug',
            'sparkles',
            'cloud'
          ])
          .default('terminal')
          .describe('Icon shown on the group'),
        cwd: z.string().optional().describe("Working directory; defaults to the group's directory"),
        serverUrl: z
          .string()
          .optional()
          .describe(
            'Declared dev-server URL (e.g. "http://localhost:3000") for commands that serve one. On toolbar server buttons this enables probe-first "ensure running, then open"; stored but inert for sidebar group terminals today.'
          ),
        launch: z
          .boolean()
          .optional()
          .describe('Launch the terminal immediately (default true); false just saves the config')
      }
    },
    (args) => runCommand('addGroupTerminal', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_close_session',
    {
      description: 'Close a Clave tab and terminate its underlying process.',
      inputSchema: { sessionId: z.string().describe('Id of the session to close') }
    },
    (args) => runCommand('closeSession', args)
  )

  server.registerTool(
    'clave_rename',
    {
      description: 'Rename a Clave group or session (tab).',
      inputSchema: {
        target: z.enum(['group', 'session']),
        id: z.string().describe('Group or session id'),
        name: z.string().describe('New display name')
      }
    },
    (args) => runCommand('rename', args)
  )

  server.registerTool(
    'clave_focus',
    {
      description: 'Focus a Clave tab (bring it to the foreground in the app).',
      inputSchema: { sessionId: z.string().describe('Id of the session to focus') }
    },
    (args) => runCommand('focus', args)
  )

  server.registerTool(
    'clave_send_to_session',
    {
      description:
        'Send a message to another agent tab (claude, antigravity, or codex): the text is typed into that tab\'s input under a provenance header naming your tab, then submitted. If the target agent is mid-task, the message queues as its next turn. Use it to report results back to the tab that opened yours (target "parent"), or to coordinate with a sibling. Refused for plain terminals (typed text would run as a shell command) and for your own tab.',
      inputSchema: {
        sessionId: z
          .string()
          .describe(
            'Target: a session id, an exact tab name, or "parent" (the tab whose agent opened yours via clave_open_session)'
          ),
        message: z
          .string()
          .min(1)
          .max(8000)
          .describe('The message, delivered verbatim under the provenance header')
      }
    },
    (args) => runCommand('sendToSession', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_read_session',
    {
      description:
        "Read the last N rendered lines of a tab's terminal without interrupting it — check what a delegated agent is doing, read a dev server's logs, or inspect a sibling's state. Works for any tab, plain terminals included. Returns scrollback for normal-buffer output (most CLIs, including claude/codex inline); for a full-screen/alternate-screen program (e.g. a pager or a TUI that took over the screen) it returns only the currently visible screen, so a large `lines` value may come back shorter. Target by session id, exact tab name, or \"parent\".",
      inputSchema: {
        sessionId: z
          .string()
          .describe('Target: a session id, an exact tab name, or "parent"'),
        lines: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe('How many trailing lines to return (default 100)')
      }
    },
    (args) => runCommand('readSession', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_read_exchanges',
    {
      description:
        'Query Clave\'s transport-layer exchange capture: what Clave recorded about inter-agent coordination — every clave_send_to_session delivery (timestamp, sender and target tab, full text, provenance header), agent-initiated tab spawns with their launch prompts, and Task-subagent fan-outs (discovered lazily from transcripts: recorded from the first delivery or query touching their parent session). Scope by group OR session, exactly one. Three views: "exchanges" (the recorded event timeline, with both endpoints\' token snapshots on each delivery — events are returned VERBATIM as stored: serializing a returned event with JSON.stringify reproduces its stored JSONL line byte-for-byte, so a record export needs no reconstruction), "usage" (each in-scope session\'s current token snapshot), "conversation" (the human-layer exchange: the human\'s messages plus the agent\'s text blocks with operations stripped — no tool calls, no tool results, no thinking — each agent entry tagged mid-turn or end-of-turn). Token snapshots carry two DISTINCT numbers, never conflate them: `billed` is cumulative spend — input/output/cache-creation/cache-read tokens summed over every API call in the session\'s transcript, Task-subagent sidecars INCLUDED (their share broken out under billed.subagents) — while `contextOccupancy` is how full the root session\'s context window is right now (the tokens that entered its latest completed call; sidecars excluded). Snapshots read the transcript as it is on disk: a still-streaming turn shows the last completed call. Read-only: nothing about the queried sessions is touched. Access uses clave_read_session\'s relationship gate — group scope requires your tab to be a member of that group; session scope requires spawn lineage ("parent", a tab you opened) or a shared group; anonymous callers are refused. The durable read path for anyone outside those relationships is the workstream record the capture exports to, not this live tool.',
      inputSchema: {
        group: z
          .string()
          .optional()
          .describe(
            'Group scope: a group id, an exact group name, or "mine". Pass exactly one of group/session.'
          ),
        session: z
          .string()
          .optional()
          .describe(
            'Session scope: a session id, an exact tab name, or "parent". Pass exactly one of group/session.'
          ),
        view: z
          .enum(['exchanges', 'usage', 'conversation'])
          .default('exchanges')
          .describe('What to return: the event timeline, token snapshots, or the human-layer conversation'),
        direction: z
          .enum(['incoming', 'outgoing'])
          .optional()
          .describe(
            'Session scope only (errors on group scope): "outgoing" = events the session sent or spawned; "incoming" = events it received or being spawned. Omit for both.'
          ),
        since: z
          .string()
          .optional()
          .describe(
            'ISO-8601 timestamp: only events (exchanges view) or entries (conversation view) at or after it. Errors on the usage view — a snapshot has no time range.'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(200)
          .describe(
            'Keep the newest N events (exchanges) or entries per session (conversation); truncation is reported via truncated/totalMatched, never silent. Inert for usage.'
          )
      }
    },
    async (args) => {
      try {
        const scope = await callRenderer<ResolvedExchangeScope>('resolveExchangeScope', {
          group: args.group,
          session: args.session,
          callerSessionId
        })
        const result = queryExchanges(scope, {
          view: args.view,
          direction: args.direction,
          since: args.since,
          limit: args.limit
        })
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err))
      }
    }
  )

  server.registerTool(
    'clave_open_file',
    {
      description:
        'Open a file as a tab in Clave for the user to read or edit — e.g. to present a document, plan, or report you produced. Idempotent: opening an already-open file focuses its existing tab. Text files render with editing; markdown renders formatted.',
      inputSchema: {
        path: z
          .string()
          .describe("File path — absolute, or relative to the calling tab's working directory"),
        name: z.string().optional().describe('Display name for the tab (defaults to the file name)')
      }
    },
    (args) => runCommand('openFile', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_notify',
    {
      description:
        'Show a native macOS notification to the user — use when finishing long-running work in a tab the user may not be watching. Clicking the notification focuses the given tab. Suppressed while the Clave window is focused (the returned status says whether it was shown).',
      inputSchema: {
        title: z.string().describe('Notification title'),
        body: z.string().describe('Notification body text'),
        sessionId: z
          .string()
          .optional()
          .describe('Tab to focus when the notification is clicked (defaults to the calling tab)')
      }
    },
    (args) => runCommand('notify', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_request_secret',
    {
      description:
        'Ask the user for a sensitive value (API key, token) WITHOUT it ever entering the conversation. Clave shows the user your description and the exact action for review, with a private masked input. For "run" actions the command MUST reference the secret only via the env var (e.g. gh secret set MY_KEY --body "$SECRET") and MUST NOT contain the value itself. For "env-file" actions Clave natively upserts KEY=value in the file (no shell). The secret value is never returned to you; command output comes back with the secret redacted. If the result is {status:"pending"}, the user has not acted yet — poll clave_secret_result with the requestId.',
      inputSchema: {
        description: z
          .string()
          .describe(
            'Human-readable explanation of what secret is needed and why — shown verbatim to the user'
          ),
        action: z
          .discriminatedUnion('type', [
            z.object({
              type: z.literal('run'),
              command: z
                .string()
                .describe(
                  'Shell command to run with the secret injected as an env var. Reference it as "$SECRET" (or your envVar). Never inline the value.'
                ),
              cwd: z.string().describe('Absolute working directory for the command'),
              envVar: z
                .string()
                .regex(/^[A-Z_][A-Z0-9_]*$/)
                .default('SECRET')
                .describe('Env var name the secret is injected as (default SECRET)')
            }),
            z.object({
              type: z.literal('env-file'),
              file: z.string().describe('Absolute path of the .env file to create or update'),
              key: z
                .string()
                .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
                .describe('Variable name to upsert; the user-supplied value becomes KEY=value')
            })
          ])
          .describe('What to do with the secret once the user provides it'),
        timeoutSeconds: z
          .number()
          .int()
          .min(5)
          .max(300)
          .default(30)
          .describe(
            'How long to block waiting for the user before returning status "pending". Keep this well under your MCP client\'s tool timeout (commonly ~60s): if the client aborts the call first, you never receive the requestId to poll with. Default 30 leaves margin; the user can still take as long as they like — you just poll clave_secret_result.'
          )
      }
    },
    async (args) => {
      const action = args.action as SecretAction
      if (action.type === 'run') {
        if (!path.isAbsolute(action.cwd)) {
          return errorResult('cwd must be an absolute path')
        }
        const ref = `$${action.envVar}`
        if (!action.command.includes(ref) && !action.command.includes(`\${${action.envVar}}`)) {
          return errorResult(
            `The command must reference the secret via ${ref} — never inline the value`
          )
        }
      } else if (!path.isAbsolute(action.file)) {
        return errorResult('file must be an absolute path')
      }
      const request = createRequest({
        description: args.description,
        action,
        callerSessionId
      })
      const result = await waitForOutcome(request.id, args.timeoutSeconds * 1000)
      return secretRequestResult(result)
    }
  )

  server.registerTool(
    'clave_offer_copy',
    {
      description:
        'Hand the user a value to copy with ONE CLICK — the outbound mirror of clave_request_secret. Use it whenever the user will paste something you produced somewhere else (a command for another machine, a config snippet, a URL, a message for Slack/email): selecting text in a terminal mangles lines, this preserves the exact bytes. A copy button appears in your tab\'s header listing every value you have offered; one call per value, with a short label so the user knows what they are copying. Returns immediately — you are not told if or when the user copies. Set sensitive:true for values that should not be previewed on screen (the user can still copy them). For long-running work, pair with clave_notify so the user knows a value is waiting.',
      inputSchema: {
        label: z
          .string()
          .min(1)
          .max(120)
          .describe('Short human-readable name for the value, e.g. "Webhook URL for the Stripe dashboard"'),
        value: z
          .string()
          .min(1)
          .max(262144)
          .describe('The exact text to place on the clipboard — newlines and formatting are preserved byte-for-byte'),
        sensitive: z
          .boolean()
          .default(false)
          .describe('Mask the on-screen preview (for values like tokens that should not be shoulder-surfable)')
      }
    },
    async (args) => {
      // Identity-gated like the cross-tab tools: the button is rendered in the
      // calling tab's header, so an anonymous caller has nowhere to surface it.
      if (!callerSessionId) {
        return errorResult(
          'clave_offer_copy requires a per-session token (it surfaces the value in the calling tab). The shared discovery token is anonymous.'
        )
      }
      const offer = createOffer({
        callerSessionId,
        label: args.label,
        value: args.value,
        sensitive: args.sensitive
      })
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: true, offerId: offer.id, label: offer.label })
          }
        ]
      }
    }
  )

  server.registerTool(
    'clave_secret_result',
    {
      description:
        'Fetch the outcome of a clave_request_secret call that returned {status:"pending"}. Optionally wait up to waitSeconds for the user to act. Outcomes are kept ~10 minutes.',
      inputSchema: {
        requestId: z.string(),
        waitSeconds: z.number().int().min(0).max(300).default(0)
      }
    },
    async (args) => {
      const request = getRequest(args.requestId)
      // Scope to the creating session so other tabs can't snoop outcomes.
      if (!request || (request.callerSessionId && request.callerSessionId !== callerSessionId)) {
        return errorResult(`No secret request "${args.requestId}"`)
      }
      const result =
        args.waitSeconds > 0
          ? await waitForOutcome(args.requestId, args.waitSeconds * 1000)
          : request
      return secretRequestResult(result)
    }
  )

  return server
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** Serialize a request for the agent: status + redacted outcome, no internals. */
function secretRequestResult(request: SecretRequest): ToolResult {
  const payload = {
    requestId: request.id,
    status: request.status,
    description: request.description,
    ...(request.outcome ? { outcome: request.outcome } : {})
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...(request.status === 'failed' ? { isError: true } : {})
  }
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== MCP_PATH) {
    res.writeHead(404).end()
    return
  }
  const auth = authenticate(req.headers.authorization)
  if (!auth.ok) {
    res.writeHead(401, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unauthorized' },
        id: null
      })
    )
    return
  }
  if (req.method !== 'POST') {
    // Stateless mode: no SSE notification stream, no sessions to delete.
    res.writeHead(405, { Allow: 'POST' }).end()
    return
  }

  // Identity comes from the token (see authenticate), NOT from any request
  // header — a tab cannot present another tab's id.
  const callerSessionId = auth.callerSessionId

  let body: unknown
  try {
    body = await readBody(req)
  } catch {
    res.writeHead(400).end()
    return
  }

  const server = buildServer(callerSessionId)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, body)
}

/**
 * Start the in-app MCP server on 127.0.0.1. Failure is non-fatal: the app
 * works without it, spawned sessions simply don't get the --mcp-config flag.
 */
export async function startMcpServer(): Promise<void> {
  registerMcpBridge()
  const { port, token } = loadOrCreateServerState()
  serverToken = token

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[mcp] request failed', err)
      if (!res.headersSent) res.writeHead(500).end()
    })
  })

  const listen = (p: number): Promise<number> =>
    new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(p, '127.0.0.1', () => {
        server.removeListener('error', reject)
        const address = server.address()
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('Could not determine MCP server port'))
      })
    })

  let boundPort: number
  try {
    boundPort = await listen(port)
  } catch {
    // Persisted port taken (another app instance, or another process) — fall
    // back to an ephemeral one. Sessions surviving from a previous run lose
    // their endpoint, but new spawns get the fresh one.
    boundPort = await listen(0)
  }

  httpServer = server
  const mcpUrl = `http://127.0.0.1:${boundPort}${MCP_PATH}`
  setMcpRuntime({ url: mcpUrl, token })
  // Re-map per-session tokens from surviving tabs' config files (post-restart),
  // now that runtime.token is set so the anonymous shared token is skipped.
  rebuildSessionTokens()
  saveServerState(mcpUrl, token)
  console.log(`[mcp] listening on ${mcpUrl}`)
}

export function stopMcpServer(): void {
  httpServer?.close()
  httpServer = null
  setMcpRuntime(null)
}

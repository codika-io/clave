import * as http from 'http'
import { createHash, timingSafeEqual } from 'crypto'
import { app } from 'electron'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { callRenderer, registerMcpBridge } from './mcp-bridge'
import { loadOrCreateServerState, saveServerState, setMcpRuntime } from './mcp-runtime'

const MCP_PATH = '/mcp'

const INSTRUCTIONS = `You are running inside Clave, a desktop app that manages multiple agent sessions as tabs organized into groups in a sidebar. You are one of those tabs. The clave_* tools let you manipulate the app around you: list the current tabs and groups, open sibling tabs (claude, gemini, codex, or a plain terminal, in any directory — optionally with an initial prompt, so you can delegate a task to a fresh agent), create groups, move tabs between groups, attach quick-launch terminals to a group (a saved command like a dev server, run on click or immediately), launch pinned workspace groups (whole-group templates defined in .clave files — clave_list shows which exist), and rename, focus, or close tabs. Pass groupId "mine" to target the group your own tab lives in. When a task would benefit from a parallel session — a dev server, a long build, a second agent working on another part of the codebase — offer to open one with clave_open_session or clave_add_group_terminal instead of running it inline.`

let httpServer: http.Server | null = null
let serverToken: string | null = null

function tokenMatches(authHeader: string | undefined): boolean {
  if (!serverToken || !authHeader?.startsWith('Bearer ')) return false
  // Hash both sides so timingSafeEqual gets equal-length buffers.
  const presented = createHash('sha256').update(authHeader.slice('Bearer '.length)).digest()
  const expected = createHash('sha256').update(serverToken).digest()
  return timingSafeEqual(presented, expected)
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
 * `callerSessionId` (from the X-Clave-Session-Id header injected into each
 * spawned session's config) identifies which tab is calling.
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
        'List all groups and sessions (tabs) currently open in Clave, plus the pinned workspace groups (launchable templates from .clave files, with their state: idle / active-visible / active-hidden), the focused session, and — when called from inside a Clave tab — which session/group is yours.'
    },
    () => runCommand('list', { callerSessionId })
  )

  server.registerTool(
    'clave_create_group',
    {
      description:
        'Create a new (empty) group in the Clave sidebar. Returns the new groupId. Follow up with clave_open_session to put a tab in it — some interactions prune empty groups.',
      inputSchema: { name: z.string().describe('Display name for the group') }
    },
    (args) => runCommand('createGroup', args)
  )

  server.registerTool(
    'clave_open_session',
    {
      description:
        'Open a new tab in Clave: a Claude Code, Gemini CLI, or Codex CLI session, or a plain terminal, in the given directory. Optionally place it in a group — pass a groupId, an exact group name, or "mine" for the calling tab\'s own group. Returns { sessionId, groupId }.',
      inputSchema: {
        cwd: z.string().describe('Absolute path of the working directory for the new session'),
        mode: z
          .enum(['claude', 'gemini', 'codex', 'terminal'])
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
          .describe(
            'Agent modes only: an initial prompt the agent starts working on immediately'
          )
      }
    },
    (args) => runCommand('openSession', { ...args, callerSessionId })
  )

  server.registerTool(
    'clave_launch_group',
    {
      description:
        'Launch a pinned workspace group (a template from a .clave file): spawns all its sessions and attaches its quick-launch terminals as one group. If the group is already running but hidden, it is shown instead. Use clave_list to see the available pinned groups and their state.',
      inputSchema: {
        group: z.string().describe('Pinned group id or name (case-insensitive)')
      }
    },
    (args) => runCommand('launchGroup', args)
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
        groupId: z
          .string()
          .describe('Target group: a group id, an exact group name, or "mine"'),
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
        cwd: z
          .string()
          .optional()
          .describe("Working directory; defaults to the group's directory"),
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

  return server
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== MCP_PATH) {
    res.writeHead(404).end()
    return
  }
  if (!tokenMatches(req.headers.authorization)) {
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

  const headerValue = req.headers['x-clave-session-id']
  const callerSessionId = Array.isArray(headerValue) ? headerValue[0] : headerValue

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
  saveServerState(mcpUrl, token)
  console.log(`[mcp] listening on ${mcpUrl}`)
}

export function stopMcpServer(): void {
  httpServer?.close()
  httpServer = null
  setMcpRuntime(null)
}

import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { Agent, ChatMessage } from '../shared/remote-types'

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const TICK_TIMEOUT_FACTOR = 3 // close if no tick for 3x interval

interface ConnectionEntry {
  ws: WebSocket
  wsUrl: string
  token?: string
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  tickTimer: ReturnType<typeof setTimeout> | null
  tickIntervalMs: number
  intentionalClose: boolean
  connected: boolean
  pending: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
}

type MessageCallback = (locationId: string, message: ChatMessage) => void
type AgentsCallback = (locationId: string, agents: Agent[]) => void

class OpenClawClient {
  private connections = new Map<string, ConnectionEntry>()
  private messageCallbacks = new Set<MessageCallback>()
  private agentCallbacks = new Set<AgentsCallback>()

  async connect(locationId: string, wsUrl: string, token?: string): Promise<void> {
    // Disconnect existing connection if any
    this.disconnect(locationId)

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl)

      const entry: ConnectionEntry = {
        ws,
        wsUrl,
        token,
        reconnectAttempts: 0,
        reconnectTimer: null,
        tickTimer: null,
        tickIntervalMs: 30000,
        intentionalClose: false,
        connected: false,
        pending: new Map()
      }

      this.connections.set(locationId, entry)

      ws.on('open', () => {
        // Wait for connect.challenge event — don't resolve yet
      })

      ws.on('message', (data) => {
        this.handleMessage(locationId, entry, data, resolve)
      })

      ws.on('close', () => {
        this.stopTickWatch(entry)
        entry.connected = false
        // Reject all pending requests
        for (const [, p] of entry.pending) {
          p.reject(new Error('connection closed'))
        }
        entry.pending.clear()

        if (!entry.intentionalClose) {
          this.scheduleReconnect(locationId, entry)
        }
      })

      ws.on('error', (err) => {
        if (ws.readyState === WebSocket.CONNECTING) {
          this.connections.delete(locationId)
          reject(err)
        }
      })
    })
  }

  disconnect(locationId: string): void {
    const entry = this.connections.get(locationId)
    if (!entry) return

    entry.intentionalClose = true
    this.stopTickWatch(entry)

    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer)
      entry.reconnectTimer = null
    }

    if (entry.ws.readyState === WebSocket.OPEN || entry.ws.readyState === WebSocket.CONNECTING) {
      entry.ws.close()
    }

    this.connections.delete(locationId)
  }

  disconnectAll(): void {
    for (const locationId of [...this.connections.keys()]) {
      this.disconnect(locationId)
    }
  }

  /** Send a message to an agent */
  async sendToAgent(locationId: string, agentId: string, content: string): Promise<void> {
    await this.request(locationId, 'agent', {
      message: content,
      agentId,
      deliver: false
    })
  }

  /** Request agents list from the gateway via health RPC */
  requestAgents(locationId: string): void {
    this.request(locationId, 'health', {}).then((payload) => {
      const raw = payload as { agents?: Array<{ agentId: string; name?: string; isDefault?: boolean }> }
      if (!raw?.agents) return
      const agents: Agent[] = raw.agents.map((a) => ({
        id: a.agentId,
        name: a.name || a.agentId,
        status: 'online',
        locationId
      }))
      for (const cb of this.agentCallbacks) {
        cb(locationId, agents)
      }
    }).catch(() => {
      // Health request failed
    })
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback)
    return () => { this.messageCallbacks.delete(callback) }
  }

  onAgentsUpdate(callback: AgentsCallback): () => void {
    this.agentCallbacks.add(callback)
    return () => { this.agentCallbacks.delete(callback) }
  }

  // ── Private ──

  private request(locationId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    const entry = this.connections.get(locationId)
    if (!entry || entry.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected'))
    }

    const id = randomUUID()
    const frame = { type: 'req', id, method, params }

    return new Promise((resolve, reject) => {
      entry.pending.set(id, { resolve, reject })
      entry.ws.send(JSON.stringify(frame))

      // Timeout after 30s
      setTimeout(() => {
        if (entry.pending.has(id)) {
          entry.pending.delete(id)
          reject(new Error(`request timeout: ${method}`))
        }
      }, 30000)
    })
  }

  private handleMessage(
    locationId: string,
    entry: ConnectionEntry,
    data: WebSocket.RawData,
    onFirstConnect: () => void
  ): void {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(data.toString())
    } catch {
      return
    }

    // Event frames: { type: "event", event: "...", payload: ... }
    if (parsed.type === 'event') {
      const event = parsed.event as string

      if (event === 'connect.challenge') {
        // Respond with connect request
        const payload = parsed.payload as { nonce?: string }
        const nonce = payload?.nonce
        if (!nonce) return

        this.request(locationId, 'connect', {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client',
            displayName: 'Clave',
            version: '1.14.0',
            platform: process.platform,
            mode: 'backend'
          },
          caps: [],
          auth: entry.token ? { token: entry.token } : undefined,
          role: 'operator',
          scopes: ['operator.admin']
        }).then((payload) => {
          entry.connected = true
          entry.reconnectAttempts = 0

          // Extract tick interval from policy
          const res = payload as { policy?: { tickIntervalMs?: number } }
          if (res?.policy?.tickIntervalMs) {
            entry.tickIntervalMs = res.policy.tickIntervalMs
          }
          this.startTickWatch(entry)

          // Request agents list
          this.requestAgents(locationId)

          onFirstConnect()
        }).catch(() => {
          entry.ws.close()
        })
        return
      }

      if (event === 'tick') {
        // Reset tick watchdog
        this.resetTickWatch(entry)
        return
      }

      // Agent response events (streaming)
      if (event === 'agent.chunk' || event === 'agent.done') {
        const p = parsed.payload as { agentId?: string; text?: string; content?: string }
        if (p?.agentId) {
          const message: ChatMessage = {
            id: randomUUID(),
            agentId: p.agentId,
            role: 'assistant',
            content: p.text || p.content || '',
            timestamp: Date.now(),
            status: event === 'agent.done' ? 'delivered' : 'sending'
          }
          for (const cb of this.messageCallbacks) {
            cb(locationId, message)
          }
        }
        return
      }

      // Health events — refresh agent list
      if (event === 'health') {
        const p = parsed.payload as { agents?: Array<{ agentId: string; name?: string }> }
        if (p?.agents) {
          const agents: Agent[] = p.agents.map((a) => ({
            id: a.agentId,
            name: a.name || a.agentId,
            status: 'online',
            locationId
          }))
          for (const cb of this.agentCallbacks) {
            cb(locationId, agents)
          }
        }
      }

      return
    }

    // Response frames: { type: "res", id: "...", ok: bool, payload: ..., error: ... }
    if (parsed.type === 'res') {
      const id = parsed.id as string
      const pending = entry.pending.get(id)
      if (!pending) return

      entry.pending.delete(id)

      if (parsed.ok) {
        pending.resolve(parsed.payload)
      } else {
        const err = parsed.error as { message?: string; code?: string }
        pending.reject(new Error(err?.message || 'unknown error'))
      }
    }
  }

  private startTickWatch(entry: ConnectionEntry): void {
    this.stopTickWatch(entry)
    this.resetTickWatch(entry)
  }

  private resetTickWatch(entry: ConnectionEntry): void {
    if (entry.tickTimer) clearTimeout(entry.tickTimer)
    entry.tickTimer = setTimeout(() => {
      // No tick received for too long — close and reconnect
      if (entry.ws.readyState === WebSocket.OPEN) {
        entry.ws.terminate()
      }
    }, entry.tickIntervalMs * TICK_TIMEOUT_FACTOR)
  }

  private stopTickWatch(entry: ConnectionEntry): void {
    if (entry.tickTimer) {
      clearTimeout(entry.tickTimer)
      entry.tickTimer = null
    }
  }

  private scheduleReconnect(locationId: string, entry: ConnectionEntry): void {
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, entry.reconnectAttempts),
      RECONNECT_MAX_MS
    )
    entry.reconnectAttempts++

    entry.reconnectTimer = setTimeout(async () => {
      entry.reconnectTimer = null
      try {
        await this.connect(locationId, entry.wsUrl, entry.token)
      } catch {
        // connect failed — the close handler will schedule another reconnect
      }
    }, delay)
  }
}

export const openclawClient = new OpenClawClient()

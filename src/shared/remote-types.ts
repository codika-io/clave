// ── Location — a machine Clave can connect to ──

export type LocationStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

export interface Location {
  id: string
  name: string
  type: 'local' | 'remote'
  host?: string
  port?: number
  username?: string
  authMethod?: 'key' | 'password' | 'agent'
  privateKeyPath?: string
  autoConnect?: boolean
  status: LocationStatus
  lastConnectedAt?: number
  openclawVersion?: string
  openclawPort?: number
  openclawToken?: string
}

// ── SSH connection config (subset for encrypted storage) ──

export interface SSHConnectionConfig {
  host: string
  port: number
  username: string
  authMethod: 'key' | 'password' | 'agent'
  privateKeyPath?: string
  password?: string // encrypted at rest via safeStorage
}

// ── Agent — an OpenClaw agent on a location ──

export type AgentStatus = 'online' | 'offline' | 'busy' | 'error'

export interface Agent {
  id: string
  name: string
  locationId: string
  status: AgentStatus
  model?: string
  cwd?: string
}

// ── Chat message ──

export type ChatMessageStatus = 'sending' | 'streaming' | 'sent' | 'delivered' | 'error'

export interface ChatMessage {
  id: string
  agentId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  status: ChatMessageStatus
}

// ── Remote FS entry ──

export interface RemoteDirEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

import { create } from 'zustand'
import type { Agent, AgentStatus, ChatMessage, ChatMessageStatus } from '../../../shared/remote-types'

interface AgentState {
  agents: Agent[]
  activeAgentId: string | null
  messages: Record<string, ChatMessage[]>
  loadAgents: (locationId: string) => Promise<void>
  setAgents: (locationId: string, agents: Agent[]) => void
  setActiveAgent: (id: string | null) => void
  addMessage: (agentId: string, message: ChatMessage) => void
  updateMessageStatus: (agentId: string, messageId: string, status: ChatMessageStatus) => void
  appendMessageContent: (agentId: string, messageId: string, content: string) => void
  setAgentStatus: (agentId: string, status: AgentStatus) => void
  clearMessages: (agentId: string) => void
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  activeAgentId: null,
  messages: {},

  loadAgents: async (locationId) => {
    if (!window.electronAPI?.agentList) return
    await window.electronAPI.agentList(locationId)
  },

  setAgents: (locationId, agents) => {
    set((s) => {
      // Merge: replace agents for this location, keep others
      const otherAgents = s.agents.filter((a) => a.locationId !== locationId)
      return { agents: [...otherAgents, ...agents] }
    })
  },

  setActiveAgent: (id) => set({ activeAgentId: id }),

  addMessage: (agentId, message) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [agentId]: [...(s.messages[agentId] || []), message]
      }
    }))
  },

  updateMessageStatus: (agentId, messageId, status) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [agentId]: (s.messages[agentId] || []).map((m) =>
          m.id === messageId ? { ...m, status } : m
        )
      }
    }))
  },

  appendMessageContent: (agentId, messageId, content) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [agentId]: (s.messages[agentId] || []).map((m) =>
          m.id === messageId ? { ...m, content: m.content + content } : m
        )
      }
    }))
  },

  setAgentStatus: (agentId, status) => {
    set((s) => ({
      agents: s.agents.map((a) => (a.id === agentId ? { ...a, status } : a))
    }))
  },

  clearMessages: (agentId) => {
    set((s) => ({
      messages: { ...s.messages, [agentId]: [] }
    }))
  }
}))

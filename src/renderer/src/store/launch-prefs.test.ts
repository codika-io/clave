/**
 * The launcher's memory: the mapping between an `AgentSetup` and the four spawn
 * booleans, which agents can take a launch prompt, and the validation that
 * decides what a persisted preference file is allowed to say.
 *
 * All pure. The persistence itself (`rememberAgentSetup` / `loadLaunchPrefs`)
 * talks to the main process and is covered by the Electron specs instead.
 */

import { describe, expect, it } from 'vitest'
import {
  agentAcceptsPrompt,
  agentSetupToModes,
  DEFAULT_AGENT_SETUP,
  type AgentKind,
  type AgentSetup
} from './launch-prefs'

const KINDS: AgentKind[] = ['claude', 'claude-agents', 'antigravity', 'codex']

describe('agentSetupToModes', () => {
  it('sets exactly one boolean, whichever kind it is', () => {
    for (const kind of KINDS) {
      const modes = agentSetupToModes({ kind, dangerousMode: false })
      const on = Object.values(modes).filter(Boolean)
      expect({ kind, on: on.length }).toEqual({ kind, on: 1 })
    }
  })

  it('maps each kind to its own boolean', () => {
    expect(agentSetupToModes({ kind: 'claude', dangerousMode: false }).claudeMode).toBe(true)
    expect(agentSetupToModes({ kind: 'claude-agents', dangerousMode: false }).claudeAgentsMode).toBe(true)
    expect(agentSetupToModes({ kind: 'antigravity', dangerousMode: false }).antigravityMode).toBe(true)
    expect(agentSetupToModes({ kind: 'codex', dangerousMode: false }).codexMode).toBe(true)
  })

  it('never sets claudeMode alongside another provider', () => {
    for (const kind of KINDS.filter((k) => k !== 'claude')) {
      expect(agentSetupToModes({ kind, dangerousMode: false }).claudeMode).toBe(false)
    }
  })
})

describe('agentAcceptsPrompt', () => {
  it('is false for a plain terminal — typed text would run as a shell command', () => {
    expect(agentAcceptsPrompt(null)).toBe(false)
  })

  it('is false for claude agents — the subcommand rejects a positional prompt', () => {
    expect(agentAcceptsPrompt({ kind: 'claude-agents', dangerousMode: false })).toBe(false)
  })

  it('is true for the agents that take one', () => {
    for (const kind of ['claude', 'antigravity', 'codex'] as AgentKind[]) {
      expect(agentAcceptsPrompt({ kind, dangerousMode: false })).toBe(true)
    }
  })

  it('is the single source of truth the UI and the spawn path both read', () => {
    // Regression guard: the group `+` row promised a prompt that the launch then
    // dropped, because the tooltip and the spawn path each had their own rule.
    const setup: AgentSetup = { kind: 'claude-agents', dangerousMode: false }
    const uiWillPromise = agentAcceptsPrompt(setup)
    const spawnWillSend = agentAcceptsPrompt(setup)
    expect(uiWillPromise).toBe(spawnWillSend)
  })
})

describe('DEFAULT_AGENT_SETUP', () => {
  it('is a safe default — Claude, permissions on', () => {
    expect(DEFAULT_AGENT_SETUP).toEqual({ kind: 'claude', dangerousMode: false })
  })
})

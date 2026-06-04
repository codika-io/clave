import { useCallback, useRef, useState } from 'react'
import { useAgentStore } from '../../store/agent-store'
import { useLocationStore } from '../../store/location-store'
import {
  PencilSquareIcon,
  CommandLineIcon,
  BoltIcon
} from '@heroicons/react/24/outline'
import { AgentPickerPopover } from '../agents/AgentPickerPopover'
import { ClaudeLogo, GeminiLogo, CodexLogo } from '../icons/cli-logos'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from '../ui/dropdown-menu'

interface NewSessionDropdownProps {
  onNewSession: (options: { claudeMode: boolean; geminiMode: boolean; codexMode: boolean; claudeAgentsMode: boolean; dangerousMode: boolean; locationId?: string }) => void
  loading: boolean
}

export function NewSessionDropdown({ onNewSession, loading }: NewSessionDropdownProps) {
  const [open, setOpen] = useState(false)
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const agents = useAgentStore((s) => s.agents)
  const locations = useLocationStore((s) => s.locations)

  const connectedRemoteLocations = locations.filter(
    (l) => l.type === 'remote' && l.status === 'connected'
  )
  const hasRemoteLocations = connectedRemoteLocations.length > 0
  const hasAgentLocations = agents.length > 0

  const handleOption = useCallback(
    (claudeMode: boolean, dangerousMode: boolean, locationId?: string, geminiMode?: boolean, codexMode?: boolean, claudeAgentsMode?: boolean) => {
      setOpen(false)
      onNewSession({ claudeMode, geminiMode: geminiMode ?? false, codexMode: codexMode ?? false, claudeAgentsMode: claudeAgentsMode ?? false, dangerousMode, locationId })
    },
    [onNewSession]
  )

  return (
    <div className="relative">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            ref={(el) => { btnRef.current = el }}
            disabled={loading}
            className="sidebar-item w-full disabled:opacity-50"
            title="New session"
          >
            <PencilSquareIcon className="sidebar-tab-icon flex-shrink-0 text-text-tertiary" />
            <span className="truncate">New session</span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent animated open={open} side="right" align="start" sideOffset={16} alignOffset={6}>
          {hasRemoteLocations && (
            <DropdownMenuLabel>This Mac</DropdownMenuLabel>
          )}

          <DropdownMenuItem onSelect={() => handleOption(false, false)}>
            <CommandLineIcon className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
            <span className="flex-1">Terminal</span>
            <DropdownMenuShortcut>{'\u2318T'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleOption(true, false)}>
            <ClaudeLogo className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
            <span className="flex-1">Claude Code</span>
            <DropdownMenuShortcut>{'\u2318N'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleOption(true, true)}>
            <ClaudeLogo className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
            <span className="flex-1">Claude Code (skip permissions)</span>
            <DropdownMenuShortcut>{'\u2318D'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleOption(false, false, undefined, false, false, true)}>
            <ClaudeLogo className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
            <span className="flex-1">Claude Agents</span>
            <DropdownMenuShortcut>{'\u2318\u21e7A'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleOption(false, false, undefined, true)}>
            <GeminiLogo className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
            <span className="flex-1">Gemini CLI</span>
            <DropdownMenuShortcut>{'\u2318I'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleOption(false, false, undefined, false, true)}>
            <CodexLogo className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
            <span className="flex-1">Codex CLI</span>
            <DropdownMenuShortcut>{'\u2318U'}</DropdownMenuShortcut>
          </DropdownMenuItem>

          {connectedRemoteLocations.map((loc) => (
            <div key={loc.id}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="truncate">{loc.name}</span>
                  {loc.host && (
                    <span className="text-text-tertiary/60 font-normal normal-case">({loc.host})</span>
                  )}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => handleOption(false, false, loc.id)}>
                <CommandLineIcon className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
                <span className="flex-1">Terminal</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleOption(true, false, loc.id)}>
                <ClaudeLogo className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
                <span className="flex-1">Claude Code</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleOption(false, false, loc.id, true)}>
                <GeminiLogo className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
                <span className="flex-1">Gemini CLI</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleOption(false, false, loc.id, false, true)}>
                <CodexLogo className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
                <span className="flex-1">Codex CLI</span>
              </DropdownMenuItem>
            </div>
          ))}

          {hasAgentLocations && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => {
                setOpen(false)
                setAgentPickerOpen(true)
              }}>
                <BoltIcon className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
                <span className="flex-1">OpenClaw Agent...</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {agentPickerOpen && (
        <AgentPickerPopover
          anchorRef={btnRef}
          onClose={() => setAgentPickerOpen(false)}
        />
      )}
    </div>
  )
}

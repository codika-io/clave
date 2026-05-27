import { useCallback, useRef, useState } from 'react'
import { useAgentStore } from '../../store/agent-store'
import { useLocationStore } from '../../store/location-store'
import {
  PencilSquareIcon,
  CommandLineIcon,
  ShieldExclamationIcon,
  BoltIcon
} from '@heroicons/react/24/outline'
import { AgentPickerPopover } from '../agents/AgentPickerPopover'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from '../ui/dropdown-menu'

function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
        fill="currentColor"
        fillRule="nonzero"
      />
    </svg>
  )
}

function GeminiLogo({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 65 65" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M57.865 29.011C52.865 26.859 48.49 23.906 44.74 20.157C40.99 16.407 38.037 12.031 35.885 7.031C35.059 5.115 34.395 3.146 33.886 1.126C33.72.466 33.128.001 32.448.001C31.767.001 31.175.466 31.009 1.126C30.5 3.146 29.836 5.113 29.01 7.031C26.858 12.031 23.905 16.407 20.156 20.157C16.406 23.906 12.03 26.859 7.03 29.011C5.114 29.837 3.144 30.501 1.125 31.01C.465 31.176 0 31.768 0 32.449C0 33.129.465 33.721 1.125 33.887C3.144 34.396 5.112 35.06 7.03 35.886C12.03 38.038 16.405 40.991 20.156 44.74C23.907 48.49 26.858 52.866 29.01 57.866C29.836 59.782 30.5 61.752 31.009 63.771C31.175 64.431 31.767 64.896 32.448 64.896C33.128 64.896 33.72 64.431 33.886 63.771C34.395 61.752 35.059 59.784 35.885 57.866C38.037 52.866 40.99 48.492 44.74 44.74C48.489 40.991 52.865 38.038 57.865 35.886C59.781 35.06 61.751 34.396 63.77 33.887C64.43 33.721 64.895 33.129 64.895 32.449C64.895 31.768 64.43 31.176 63.77 31.01C61.751 30.501 59.783 29.837 57.865 29.011Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CodexLogo({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.1419.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z"
        fill="currentColor"
      />
    </svg>
  )
}

interface NewSessionDropdownProps {
  onNewSession: (options: { claudeMode: boolean; geminiMode: boolean; codexMode: boolean; dangerousMode: boolean; locationId?: string }) => void
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
    (claudeMode: boolean, dangerousMode: boolean, locationId?: string, geminiMode?: boolean, codexMode?: boolean) => {
      setOpen(false)
      onNewSession({ claudeMode, geminiMode: geminiMode ?? false, codexMode: codexMode ?? false, dangerousMode, locationId })
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
            <ShieldExclamationIcon className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary" />
            <span className="flex-1">Claude Code (skip permissions)</span>
            <DropdownMenuShortcut>{'\u2318D'}</DropdownMenuShortcut>
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

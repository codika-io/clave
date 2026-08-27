import {
  ChevronLeftIcon,
  AdjustmentsHorizontalIcon,
  SwatchIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
  CpuChipIcon
} from '@heroicons/react/24/outline'
import { useUpdaterStore } from '../../store/updater-store'
import { useSessionStore, type SettingsSection } from '../../store/session-store'

const SECTIONS: { id: SettingsSection; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [
  { id: 'general', label: 'General', icon: AdjustmentsHorizontalIcon },
  { id: 'agents', label: 'Agents', icon: CpuChipIcon },
  { id: 'appearance', label: 'Appearance', icon: SwatchIcon },
  { id: 'updates', label: 'Software Update', icon: ArrowDownTrayIcon },
  { id: 'usage', label: 'Usage', icon: ChartBarIcon }
]

/** Settings-mode replacement for the sessions sidebar. */
export function SettingsSidebar() {
  const settingsSection = useSessionStore((s) => s.settingsSection)
  const setSettingsSection = useSessionStore((s) => s.setSettingsSection)
  const setActiveView = useSessionStore((s) => s.setActiveView)
  const updatePhase = useUpdaterStore((s) => s.phase)
  // A waiting update earns a dot on its row — the same signal macOS puts on
  // System Settings, and the reason a user thinks to look here at all.
  const updateWaiting = updatePhase === 'available' || updatePhase === 'downloaded'

  return (
    <div className="flex flex-col h-full bg-surface-50">
      {/* Draggable top spacer — clears the macOS traffic lights */}
      <div
        className="pt-11 pb-1 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Header: back to sessions + title */}
      <div className="px-2 pb-2 flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => setActiveView('terminals')}
          className="btn-icon btn-icon-xs"
          title="Back to sessions"
          aria-label="Back to sessions"
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-semibold text-text-primary select-none">Settings</span>
      </div>

      <nav className="px-2 space-y-0.5">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSettingsSection(id)}
            className="sidebar-item"
            data-selected={settingsSection === id ? 'true' : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0 opacity-60" />
            <span>{label}</span>
            {id === 'updates' && updateWaiting && (
              <span className="ml-auto w-2 h-2 rounded-full bg-accent flex-shrink-0" />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}

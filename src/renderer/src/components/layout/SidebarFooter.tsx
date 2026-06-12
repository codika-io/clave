import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cog6ToothIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useUserStore } from '../../store/user-store'
import { useSessionStore } from '../../store/session-store'
import { useUpdaterStore } from '../../store/updater-store'
import { UserIconDisplay } from '../ui/UserIconDisplay'

export function UpdateBanner() {
  const phase = useUpdaterStore((s) => s.phase)
  const version = useUpdaterStore((s) => s.version)
  const dismissed = useUpdaterStore((s) => s.dismissed)
  const setAvailable = useUpdaterStore((s) => s.setAvailable)
  const setDownloading = useUpdaterStore((s) => s.setDownloading)
  const dismiss = useUpdaterStore((s) => s.dismiss)

  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable) return
    return window.electronAPI.onUpdateAvailable((v) => {
      setAvailable(v)
    })
  }, [setAvailable])

  const handleUpdate = () => {
    setDownloading()
    window.electronAPI?.startDownload()
  }

  const showUpdateBanner = phase === 'available' && !dismissed

  return (
    <AnimatePresence>
      {showUpdateBanner && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-accent/8 border border-accent/15">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-accent/12 flex-shrink-0">
              <ArrowDownTrayIcon className="w-3.5 h-3.5 text-accent" />
            </div>
            <p className="text-[12px] font-medium text-text-primary leading-tight">
              {version ? `v${version}` : 'Update'}
            </p>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={dismiss}
                className="px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary hover:text-text-secondary rounded-md hover:bg-surface-200 transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleUpdate}
                className="px-2 py-0.5 text-[11px] font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
              >
                Update
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function SidebarFooter() {
  const name = useUserStore((s) => s.name)
  const avatarIcon = useUserStore((s) => s.avatarIcon)
  const avatarColor = useUserStore((s) => s.avatarColor)
  const openSettings = useSessionStore((s) => s.openSettings)

  const phase = useUpdaterStore((s) => s.phase)
  const version = useUpdaterStore((s) => s.version)
  const dismissed = useUpdaterStore((s) => s.dismissed)
  const undismiss = useUpdaterStore((s) => s.undismiss)

  const showUpdateDot = dismissed && version !== null && phase === 'available'

  return (
    <button
      onClick={() => openSettings()}
      className="group w-full flex items-center gap-2 px-2 py-1 rounded-lg text-text-primary"
      title="Settings (⌘,)"
    >
      <div className="relative">
        <UserIconDisplay icon={avatarIcon} color={avatarColor} size="xs" />
        {/* Update dot indicator when dismissed */}
        {showUpdateDot && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              undismiss()
            }}
          />
        )}
      </div>
      <div className="flex-1 text-left min-w-0">
        <span className="text-[13px] font-semibold truncate block">{name}</span>
      </div>
      {/* Hover affordance lives on the gear only — it lifts with a subtle shadow */}
      <span className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0 text-text-tertiary transition-all duration-150 group-hover:text-text-primary group-hover:bg-surface-0 group-hover:shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0.5px_rgba(0,0,0,0.2)]">
        <Cog6ToothIcon className="w-4 h-4" />
      </span>
    </button>
  )
}

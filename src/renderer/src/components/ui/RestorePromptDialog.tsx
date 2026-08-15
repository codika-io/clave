import { useEffect, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { useRestorePromptStore } from '../../store/restore-prompt-store'

/** Launch restore prompt — shown when the previous run left sessions that can
 *  only come back via an actual relaunch (plain records, or tmux records whose
 *  server died with a reboot). Live tmux survivors never pass through here;
 *  they reattach silently because they were never disrupted. */
export function RestorePromptDialog(): React.JSX.Element | null {
  const pending = useRestorePromptStore((s) => s.pending)
  const resolver = useRestorePromptStore((s) => s.resolver)
  const restoreRef = useRef<HTMLButtonElement>(null)

  const isOpen = !!pending && !!resolver

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => restoreRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  const agents = pending.filter(
    (r) => r.claudeMode || r.antigravityMode || r.codexMode || r.claudeAgentsMode
  ).length
  const terminals = pending.length - agents
  const parts: string[] = []
  if (agents > 0) parts.push(`${agents} agent session${agents === 1 ? '' : 's'}`)
  if (terminals > 0) parts.push(`${terminals} terminal${terminals === 1 ? '' : 's'}`)

  return (
    <DialogPrimitive.Root open={isOpen}>
      <AnimatePresence>
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="fixed inset-0 bg-white/5 backdrop-blur-sm z-50"
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content
            asChild
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
              className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px]"
            >
              <div className="bg-surface-0 rounded-xl border border-border shadow-2xl overflow-hidden">
                <div className="px-4 pt-4 pb-3 text-center">
                  <DialogPrimitive.Title className="text-[13px] font-semibold text-text-primary">
                    Restore previous session?
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                    {parts.join(' and ')} from last time can be relaunched — terminals reopen in
                    their folders, agents resume their conversations. Commands are not re-run.
                  </DialogPrimitive.Description>
                </div>
                <div className="border-t border-border-subtle flex">
                  <button
                    type="button"
                    onClick={() => resolver(false)}
                    className="btn-dialog text-text-secondary hover:text-text-primary border-r border-border-subtle"
                  >
                    Start fresh
                  </button>
                  <button
                    ref={restoreRef}
                    type="button"
                    onClick={() => resolver(true)}
                    className="btn-dialog text-accent hover:brightness-110 outline-none"
                  >
                    Restore
                  </button>
                </div>
              </div>
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  type GroupTerminalColor,
  GROUP_TERMINAL_COLORS,
  TERMINAL_COLOR_VALUES
} from '../../store/session-store'

interface GroupCommandDialogProps {
  isOpen: boolean
  onSave: (command: string, mode: 'prefill' | 'auto', color: GroupTerminalColor) => void
  onCancel: () => void
  onDelete?: () => void
  initialCommand?: string | null
  initialMode?: 'prefill' | 'auto'
  initialColor?: GroupTerminalColor
}

export function GroupCommandDialog({
  isOpen,
  onSave,
  onCancel,
  onDelete,
  initialCommand,
  initialMode = 'prefill',
  initialColor = 'blue'
}: GroupCommandDialogProps) {
  const [command, setCommand] = useState(initialCommand ?? '')
  const [mode, setMode] = useState<'prefill' | 'auto'>(initialMode)
  const [color, setColor] = useState<GroupTerminalColor>(initialColor)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setCommand(initialCommand ?? '')
      setMode(initialMode)
      setColor(initialColor)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, initialCommand, initialMode, initialColor])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel])

  const handleSave = () => {
    const trimmed = command.trim()
    if (trimmed) {
      onSave(trimmed, mode, color)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 bg-white/5 backdrop-blur-sm z-50"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px]"
          >
            <div className="bg-surface-0 rounded-xl border border-border shadow-2xl overflow-hidden">
              <div className="px-4 pt-4 pb-3">
                <h2 className="text-[13px] font-semibold text-text-primary">
                  {onDelete ? 'Edit terminal' : 'Add terminal'}
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Set a command to run in this group&apos;s terminal.
                </p>

                <input
                  ref={inputRef}
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSave()
                    }
                  }}
                  placeholder="e.g., npm run dev"
                  className="mt-3 w-full h-8 px-3 rounded-lg bg-surface-100 border border-border-subtle text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent transition-colors"
                />

                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-text-secondary">Mode:</span>
                  <div className="flex rounded-lg overflow-hidden border border-border-subtle">
                    <button
                      type="button"
                      onClick={() => setMode('prefill')}
                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                        mode === 'prefill'
                          ? 'bg-surface-200 text-text-primary'
                          : 'bg-surface-100 text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      Pre-fill
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('auto')}
                      className={`px-3 py-1 text-[11px] font-medium transition-colors border-l border-border-subtle ${
                        mode === 'auto'
                          ? 'bg-surface-200 text-text-primary'
                          : 'bg-surface-100 text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      Auto-execute
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-text-secondary">Color:</span>
                  <div className="flex gap-1.5">
                    {GROUP_TERMINAL_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className="w-5 h-5 rounded-full transition-all flex-shrink-0"
                        style={{
                          backgroundColor: TERMINAL_COLOR_VALUES[c],
                          opacity: color === c ? 1 : 0.45,
                          boxShadow: color === c ? `0 0 0 2px var(--color-surface-0), 0 0 0 3.5px ${TERMINAL_COLOR_VALUES[c]}` : 'none'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-border-subtle flex">
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="flex-1 py-2.5 text-[13px] font-medium text-red-400 hover:text-red-300 hover:bg-surface-100 transition-colors border-r border-border-subtle"
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 py-2.5 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-100 transition-colors border-r border-border-subtle"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 py-2.5 text-[13px] font-medium text-accent hover:brightness-110 hover:bg-surface-100 transition-colors outline-none"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

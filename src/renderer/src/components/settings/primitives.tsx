import { cn } from '../../lib/utils'

/** Section label + optional description above a settings card. */
export function SettingsSection({
  title,
  description,
  children
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="settings-section-title mb-1.5">{title}</h3>
      {description && <p className="text-xs text-text-tertiary mb-2.5">{description}</p>}
      {children}
    </section>
  )
}

/** Grouped card: rows separated by hairline dividers. */
export function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('settings-card', className)}>{children}</div>
}

/** One row in a card: label + description left, control right. */
export function SettingsRow({
  label,
  description,
  disabled = false,
  children
}: {
  label: string
  description?: React.ReactNode
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={cn('settings-row', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <p className="settings-row-title">{label}</p>
        {description && <p className="settings-row-description">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-1.5 flex-shrink-0">{children}</div>}
    </div>
  )
}

/** Pill switch used in settings rows. */
export function Toggle({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative flex-shrink-0 w-7 h-4 rounded-full transition-colors',
        disabled && 'cursor-not-allowed',
        checked ? 'bg-accent' : 'bg-surface-300'
      )}
    >
      <div
        className={cn(
          'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[14px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

/** Toggle row shorthand: label + description left, switch right. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false
}: {
  label: string
  description: React.ReactNode
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <SettingsRow label={label} description={description} disabled={disabled}>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </SettingsRow>
  )
}

import type { FileViewMode } from './file-types'

const MODES: { key: FileViewMode; label: string }[] = [
  { key: 'page', label: 'Page' },
  { key: 'preview', label: 'Preview' },
  { key: 'source', label: 'Source' }
]

/** Segmented Page / Preview / Source switcher shown in file headers for markdown. */
export function ViewModeToggle({
  mode,
  onChange
}: {
  mode: FileViewMode
  onChange: (mode: FileViewMode) => void
}): React.JSX.Element {
  return (
    <div className="segmented flex-shrink-0">
      {MODES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          data-active={mode === key}
          className="segmented-item"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

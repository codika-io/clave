import {
  Squares2X2Icon,
  SquaresPlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { resolveColorHex, type GroupTerminalColor } from '../../store/session-types'

/** One chip. A group the workspace knows about, whether or not it is running. */
export interface SwitcherEntry {
  /** Stable react key — a pin and a live group can share a name. */
  key: string
  name: string
  color: GroupTerminalColor | null
  /** The live group's id, or null when the group is declared but not spawned. */
  liveGroupId: string | null
  /** The pin to spawn when it is not live. */
  pinnedId: string | null
}

interface GroupSwitcherProps {
  /** Every group the workspace knows about, already narrowed by the search. */
  entries: SwitcherEntry[]
  /** How many entries exist before the search narrowed them. */
  totalCount: number
  /** The live group id the list is filtered to, or null for All. */
  value: string | null
  onPick: (entry: SwitcherEntry) => void
  onAll: () => void
  onAddGroup: () => void
  addGroupActive?: boolean
  search: string
  onSearchChange: (value: string) => void
  /** Enter: act on the first entry the search left standing. */
  onSearchSubmit: () => void
}

/**
 * The group switcher: a panel under the session launcher listing every group the
 * workspace knows about — All, a chip per group, and the `+` for the full picker.
 *
 * "Knows about" is the important part, and it is what this got wrong at first.
 * The chips are drawn from the workspace's PINNED groups (the ones declared in
 * `.clave` and auto-discovered from the tree), not from the handful currently
 * spawned. A workspace declares dozens and runs three; a switcher that lists the
 * three can only ever take you where you already are. Live groups without a pin
 * are listed too, so nothing on screen is missing from it.
 *
 * A chip therefore does one of two things. Not running: spawn it, exactly as the
 * picker dialog does. Running: filter the sidebar list to it, and back to All on
 * a second click. Filtering touches the LIST only and leaves the terminals you
 * are looking at where they are.
 *
 * The search narrows the chips, so typing a group's name is how you reach one of
 * the dozens that is not on screen; the same query narrows the session list
 * below. Enter acts on the first chip left standing.
 *
 * Its top row is fixed — All, the field, the `+`. None of the three belongs to
 * the wrapping set: All is the filter's off position, the field is never
 * "selected" the way a chip is, and the `+` is the panel's action. Pinning them
 * also keeps them still while the chips below change under the search.
 *
 * Named "switcher", not "rail": .group-rail is the coloured bar down a group's
 * sessions in the list below.
 */
export function GroupSwitcher({
  entries,
  totalCount,
  value,
  onPick,
  onAll,
  onAddGroup,
  addGroupActive,
  search,
  onSearchChange,
  onSearchSubmit
}: GroupSwitcherProps): React.JSX.Element {
  return (
    <div className="group-switcher-panel">
      {/* Fixed top row: the filter's off position, the search field, the panel's
          action. The chips wrap under it. */}
      <div className="group-switcher-head">
        <button
          className="group-switcher-chip"
          data-selected={value === null ? 'true' : undefined}
          onClick={onAll}
          title="All sessions"
        >
          <Squares2X2Icon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>All</span>
        </button>

        <div className="group-switcher-search">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim()) {
                e.preventDefault()
                e.stopPropagation()
                onSearchSubmit()
              } else if (e.key === 'Escape' && search) {
                e.stopPropagation()
                onSearchChange('')
              }
            }}
            placeholder="Search groups"
            aria-label="Search groups and sessions"
            spellCheck={false}
          />
          {search && (
            <button
              className="group-switcher-search-clear"
              onClick={() => onSearchChange('')}
              title="Clear search"
              aria-label="Clear search"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          className="group-switcher-add launcher-icon-btn"
          data-active={addGroupActive ? 'true' : undefined}
          onClick={onAddGroup}
          title="Add a group"
          aria-label="Add a group"
        >
          <SquaresPlusIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="group-switcher-wrap">
        {entries.length === 0 ? (
          <span className="group-switcher-empty">
            {totalCount === 0 ? 'No groups yet' : 'No group matches'}
          </span>
        ) : (
          entries.map((entry) => {
            const hex = resolveColorHex(entry.color)
            const live = entry.liveGroupId !== null
            const selected = live && entry.liveGroupId === value
            return (
              <button
                key={entry.key}
                className="group-switcher-chip"
                data-selected={selected ? 'true' : undefined}
                data-idle={live ? undefined : 'true'}
                onClick={() => onPick(entry)}
                title={
                  !live
                    ? `Start ${entry.name}`
                    : selected
                      ? `Showing ${entry.name} only — click for all`
                      : `Show ${entry.name} only`
                }
                // Selected takes the group's own colour at the same strength its
                // card uses in the list, so the chip and the group it filtered to
                // read as the same object.
                style={hex && selected ? { backgroundColor: `${hex}4d` } : undefined}
              >
                {/* A hollow dot for a group that is declared but not running, a
                    filled one once it is — the same distinction the chip's click
                    makes, readable before you click it. */}
                <span
                  className="group-switcher-dot"
                  style={
                    hex
                      ? live
                        ? { backgroundColor: hex }
                        : { backgroundColor: 'transparent', boxShadow: `inset 0 0 0 1.5px ${hex}` }
                      : undefined
                  }
                />
                <span className="truncate">{entry.name}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

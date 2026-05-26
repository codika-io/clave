import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '../../lib/utils'

interface ContextMenuItem {
  label: string
  onClick: () => void
  shortcut?: string
  disabled?: boolean
  icon?: React.ReactNode
  danger?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
  header?: React.ReactNode
}

// Estimated menu footprint, used to decide which side of the cursor to open on.
const ESTIMATED_MENU_WIDTH = 220
const ESTIMATED_MENU_HEIGHT = 280

export function ContextMenu({ items, x, y, onClose, header }: ContextMenuProps) {
  // Open leftward / upward when the cursor is too close to the viewport edge,
  // so the menu is never cropped off-screen.
  const align = x > window.innerWidth - ESTIMATED_MENU_WIDTH ? 'end' : 'start'
  const side = y > window.innerHeight - ESTIMATED_MENU_HEIGHT ? 'top' : 'bottom'

  return (
    <DropdownMenuPrimitive.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <DropdownMenuPrimitive.Trigger
        style={{
          position: 'fixed',
          left: x,
          top: y,
          width: 0,
          height: 0,
          padding: 0,
          margin: 0,
          border: 'none',
          opacity: 0,
          pointerEvents: 'none'
        }}
      />
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          side={side}
          align={align}
          sideOffset={0}
          alignOffset={0}
          avoidCollisions
          collisionPadding={8}
          className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface-100 py-1 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {header && (
            <>
              <div className="px-3 py-1.5">{header}</div>
              <DropdownMenuPrimitive.Separator className="h-px bg-border-subtle" />
            </>
          )}
          {items.map((item) => (
            <DropdownMenuPrimitive.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={() => {
                item.onClick()
                onClose()
              }}
              className={cn(
                'relative flex cursor-pointer select-none items-center justify-between px-3 py-1.5 text-sm font-medium outline-none transition-colors',
                'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                item.danger
                  ? 'text-red-400 hover:text-red-300 focus:bg-surface-200'
                  : 'text-text-primary hover:bg-surface-200 focus:bg-surface-200'
              )}
            >
              <span className="flex items-center gap-2">
                {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                {item.label}
              </span>
              {item.shortcut && <span className="ml-4 text-text-tertiary">{item.shortcut}</span>}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}

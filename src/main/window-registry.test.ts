import { describe, it, expect } from 'vitest'
import { WindowRegistry, type WindowLike } from './window-registry'

/**
 * The WindowRegistry's rules, without Electron. Every rule here is one the
 * multi-window teardown, the spawn stamp, or the MCP routing leans on; a
 * registry that gets one wrong fails SILENTLY — a spawn stamped with the wrong
 * workspace or a tool call landing in the wrong window looks fine until
 * someone opens a second window.
 */
class FakeWindow implements WindowLike {
  private destroyed = false
  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
  }
}

function setup(focused: () => FakeWindow | null = () => null): {
  reg: WindowRegistry<FakeWindow>
  win: (id: number, ws: string | null) => FakeWindow
} {
  const reg = new WindowRegistry<FakeWindow>({ getFocusedWindow: focused })
  return {
    reg,
    win: (id, ws) => {
      const w = new FakeWindow(id)
      reg.registerWindow(w, ws)
      return w
    }
  }
}

describe('primary election', () => {
  it('the first registered window is the primary', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    win(2, 'B')
    expect(reg.getPrimaryWindow()).toBe(a)
    expect(reg.isPrimary(1)).toBe(true)
    expect(reg.isPrimary(2)).toBe(false)
  })

  it('re-elects the lowest surviving id when the primary closes', () => {
    const { reg, win } = setup()
    win(1, 'A')
    const b = win(2, 'B')
    win(3, 'C')
    reg.unregisterWindow(1)
    expect(reg.getPrimaryWindow()).toBe(b)
    expect(reg.isPrimary(2)).toBe(true)
  })

  it('keeps the primary when a non-primary closes', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    win(2, 'B')
    reg.unregisterWindow(2)
    expect(reg.getPrimaryWindow()).toBe(a)
  })

  it('never returns a destroyed window as primary, even before unregister', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    const b = win(2, 'B')
    a.destroy()
    expect(reg.getPrimaryWindow()).toBe(b)
  })

  it('returns null with no windows', () => {
    const { reg } = setup()
    expect(reg.getPrimaryWindow()).toBeNull()
  })
})

describe('window ↔ workspace', () => {
  it('maps a workspace to the window showing it and back', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    expect(reg.getWindowForWorkspace('A')).toBe(a)
    expect(reg.getWorkspaceForWindow(1)).toBe('A')
    expect(reg.getWindowForWorkspace('nope')).toBeNull()
    expect(reg.getWorkspaceForWindow(99)).toBeNull()
  })

  it('follows a switch', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    reg.setWindowWorkspace(1, 'B')
    expect(reg.getWindowForWorkspace('B')).toBe(a)
    expect(reg.getWindowForWorkspace('A')).toBeNull()
  })

  it('a workspace nobody shows is hosted by the primary', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    const b = win(2, 'B')
    expect(reg.getHostWindowForWorkspace('C')).toBe(a)
    expect(reg.getHostWindowForWorkspace('B')).toBe(b)
  })

  it('the hosted set: own workspace, plus the unshown ones for the primary only', () => {
    const { reg, win } = setup()
    win(1, 'A')
    win(2, 'B')
    const all = ['A', 'B', 'C', 'D']
    expect(reg.getHostedWorkspaceIds(1, all)).toEqual(['A', 'C', 'D'])
    expect(reg.getHostedWorkspaceIds(2, all)).toEqual(['B'])
    expect(reg.getHostedWorkspaceIds(3, all)).toEqual([])
  })

  it('the hosted set moves when a window opens or closes', () => {
    const { reg, win } = setup()
    win(1, 'A')
    const all = ['A', 'B']
    expect(reg.getHostedWorkspaceIds(1, all)).toEqual(['A', 'B'])
    win(2, 'B')
    expect(reg.getHostedWorkspaceIds(1, all)).toEqual(['A'])
    reg.unregisterWindow(2)
    expect(reg.getHostedWorkspaceIds(1, all)).toEqual(['A', 'B'])
  })
})

describe('write ownership (the hosting rule, enforced)', () => {
  it('a window may write the workspace it shows', () => {
    const { reg, win } = setup()
    win(1, 'A')
    win(2, 'B')
    expect(reg.canWriteWorkspace(1, 'A')).toBe(true)
    expect(reg.canWriteWorkspace(2, 'B')).toBe(true)
  })

  it('a window may never write a workspace another window shows', () => {
    const { reg, win } = setup()
    win(1, 'A')
    win(2, 'B')
    expect(reg.canWriteWorkspace(1, 'B')).toBe(false)
    expect(reg.canWriteWorkspace(2, 'A')).toBe(false)
  })

  it('only the primary writes an unshown workspace', () => {
    const { reg, win } = setup()
    win(1, 'A')
    win(2, 'B')
    expect(reg.canWriteWorkspace(1, 'C')).toBe(true)
    expect(reg.canWriteWorkspace(2, 'C')).toBe(false)
  })

  it('the null key (no-workspace mode) belongs to the primary alone', () => {
    const { reg, win } = setup()
    win(1, null)
    win(2, null)
    expect(reg.canWriteWorkspace(1, null)).toBe(true)
    expect(reg.canWriteWorkspace(2, null)).toBe(false)
  })

  it('an unknown or destroyed window writes nothing', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    expect(reg.canWriteWorkspace(7, 'A')).toBe(false)
    a.destroy()
    expect(reg.canWriteWorkspace(1, 'A')).toBe(false)
  })
})

describe('session hosting', () => {
  it('binds a session to a window and lists it back', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    win(2, 'B')
    reg.bindSession('s1', 1)
    reg.bindSession('s2', 2)
    reg.bindSession('s3', 1)
    expect(reg.getWindowForSession('s1')).toBe(a)
    expect(reg.getSessionsForWindow(1).sort()).toEqual(['s1', 's3'])
    expect(reg.getSessionsForWindow(2)).toEqual(['s2'])
  })

  it('unbind forgets exactly that session', () => {
    const { reg, win } = setup()
    win(1, 'A')
    reg.bindSession('s1', 1)
    reg.bindSession('s2', 1)
    reg.unbindSession('s1')
    expect(reg.getWindowForSession('s1')).toBeNull()
    expect(reg.getSessionsForWindow(1)).toEqual(['s2'])
  })

  it('a re-bind moves the session (the re-home case)', () => {
    const { reg, win } = setup()
    win(1, 'A')
    const b = win(2, 'B')
    reg.bindSession('s1', 1)
    reg.bindSession('s1', 2)
    expect(reg.getWindowForSession('s1')).toBe(b)
    expect(reg.getSessionsForWindow(1)).toEqual([])
  })

  it("unregistering a window drops its bindings and no other window's", () => {
    const { reg, win } = setup()
    win(1, 'A')
    const b = win(2, 'B')
    reg.bindSession('s1', 1)
    reg.bindSession('s2', 2)
    reg.unregisterWindow(1)
    expect(reg.getWindowForSession('s1')).toBeNull()
    expect(reg.getWindowForSession('s2')).toBe(b)
  })

  it('a session bound to a destroyed window resolves to null', () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    reg.bindSession('s1', 1)
    a.destroy()
    expect(reg.getWindowForSession('s1')).toBeNull()
  })
})

describe('resolveTargetWindow ladder', () => {
  it("rung 1: the subject session's hosting window wins over everything", () => {
    const b = new FakeWindow(2)
    const { reg, win } = setup(() => b)
    const a = win(1, 'A')
    reg.registerWindow(b, 'B')
    reg.bindSession('s1', 1)
    expect(reg.resolveTargetWindow({ sessionId: 's1', workspaceId: 'B' })).toBe(a)
  })

  it("rung 2: the workspace's host window (shown, else primary)", () => {
    const { reg, win } = setup()
    const a = win(1, 'A')
    const b = win(2, 'B')
    expect(reg.resolveTargetWindow({ workspaceId: 'B' })).toBe(b)
    expect(reg.resolveTargetWindow({ workspaceId: 'unshown' })).toBe(a)
  })

  it('rung 3: the focused window when nothing more specific applies', () => {
    const b = new FakeWindow(2)
    const { reg, win } = setup(() => b)
    win(1, 'A')
    reg.registerWindow(b, 'B')
    expect(reg.resolveTargetWindow({})).toBe(b)
    expect(reg.resolveTargetWindow({ sessionId: 'unknown' })).toBe(b)
  })

  it('rung 4: the primary when nothing is focused', () => {
    const { reg, win } = setup(() => null)
    const a = win(1, 'A')
    win(2, 'B')
    expect(reg.resolveTargetWindow({})).toBe(a)
  })

  it('a focused window the registry never saw is ignored', () => {
    const stranger = new FakeWindow(42)
    const { reg, win } = setup(() => stranger)
    const a = win(1, 'A')
    expect(reg.resolveTargetWindow({})).toBe(a)
  })

  it('null when no window exists at all', () => {
    const { reg } = setup()
    expect(reg.resolveTargetWindow({ sessionId: 's', workspaceId: 'w' })).toBeNull()
  })
})

describe('identity', () => {
  it("reports the window's own identity and nothing about other windows", () => {
    const { reg, win } = setup()
    win(1, 'A')
    win(2, 'B')
    expect(reg.identityOf(2, ['A', 'B', 'C'])).toEqual({
      windowId: 2,
      workspaceId: 'B',
      isPrimary: false,
      hostedWorkspaceIds: ['B']
    })
    expect(reg.identityOf(1, ['A', 'B', 'C'])).toEqual({
      windowId: 1,
      workspaceId: 'A',
      isPrimary: true,
      hostedWorkspaceIds: ['A', 'C']
    })
    expect(reg.identityOf(9, [])).toBeNull()
  })

  it('lists live windows lowest id first', () => {
    const { reg, win } = setup()
    win(3, 'C')
    const a = win(1, 'A')
    const b = win(2, 'B')
    reg.unregisterWindow(3)
    expect(reg.listWindows()).toEqual([a, b])
  })
})

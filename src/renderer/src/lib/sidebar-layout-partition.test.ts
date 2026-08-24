import { describe, it, expect } from 'vitest'
import {
  mergeLayoutForKeys,
  partitionSidebarLayout,
  type LayoutGroupLike,
  type LayoutSessionLike
} from './sidebar-layout-partition'

const A = 'ws-a'
const B = 'ws-b'
const g = (
  id: string,
  sessionIds: string[],
  workspaceId?: string,
  terminals: { sessionId: string | null }[] = []
): LayoutGroupLike => ({
  id,
  sessionIds,
  terminals,
  ...(workspaceId ? { workspaceId } : {})
})
const s = (id: string, workspaceId?: string): LayoutSessionLike => ({
  id,
  ...(workspaceId ? { workspaceId } : {})
})

describe('partitionSidebarLayout', () => {
  it('splits groups by their stamp and order ids by what they name', () => {
    const parts = partitionSidebarLayout(
      [g('gA', ['sA'], A), g('gB', ['sB'], B)],
      ['gA', 'sX', 'gB', 'sB2', 'tab-1'],
      [s('sA', A), s('sB', B), s('sX', A), s('sB2', B)],
      A
    )
    expect(parts.get(A)).toEqual({
      groups: [g('gA', ['sA'], A)],
      displayOrder: ['gA', 'sX', 'tab-1']
    })
    expect(parts.get(B)).toEqual({ groups: [g('gB', ['sB'], B)], displayOrder: ['gB', 'sB2'] })
  })

  it('sends unstamped items to the fallback, null included', () => {
    const parts = partitionSidebarLayout([g('g1', ['s1'])], ['g1', 's2'], [s('s2')], null)
    expect([...parts.keys()]).toEqual([null])
    expect(parts.get(null)!.displayOrder).toEqual(['g1', 's2'])
  })
})

describe('mergeLayoutForKeys', () => {
  const store = {
    groups: [g('gA', ['sA'], A), g('gB-old', ['sB-old'], B)],
    displayOrder: ['gA', 'sA2', 'gB-old', 'sB-free'],
    sessions: [s('sA', A), s('sA2', A), s('sB-free', B)]
  }

  it('replaces only the merged workspace and leaves the others untouched', () => {
    const out = mergeLayoutForKeys(
      store,
      [B],
      { groups: [g('gB-new', ['sB1', 'sB2'], B)], displayOrder: ['gB-new', 'sB-free'] },
      ['sB1', 'sB-free'],
      A
    )
    expect(out.groups.map((x) => x.id)).toEqual(['gA', 'gB-new'])
    expect(out.groups[1].sessionIds).toEqual(['sB1'])
    expect(out.displayOrder).toEqual(['gA', 'sA2', 'gB-new', 'sB-free'])
  })

  it('keeps a group whose members survive ELSEWHERE as a shell (no truncation)', () => {
    const out = mergeLayoutForKeys(
      { groups: [], displayOrder: [], sessions: [] },
      [B],
      { groups: [g('gB', ['hosted-elsewhere'], B)], displayOrder: ['gB'] },
      ['hosted-elsewhere'],
      B
    )
    expect(out.groups.map((x) => x.id)).toEqual(['gB'])
    expect(out.displayOrder).toEqual(['gB'])
  })

  it('prunes a group whose members are gone everywhere, and detaches its dead terminal', () => {
    const out = mergeLayoutForKeys(
      { groups: [], displayOrder: [], sessions: [] },
      [B],
      {
        groups: [g('dead', ['gone'], B), g('live', ['ok'], B, [{ sessionId: 'gone-term' }])],
        displayOrder: ['dead', 'live']
      },
      ['ok'],
      B
    )
    expect(out.groups.map((x) => x.id)).toEqual(['live'])
    expect(out.groups[0].terminals).toEqual([{ sessionId: null }])
    expect(out.displayOrder).toEqual(['live'])
  })

  it('never surfaces a nested session at the top level, appends missed standalone sessions', () => {
    const out = mergeLayoutForKeys(
      { groups: [], displayOrder: [], sessions: [s('in-group', B), s('standalone', B)] },
      [B],
      { groups: [g('gB', ['in-group'], B)], displayOrder: ['in-group', 'gB'] },
      ['in-group', 'standalone'],
      B
    )
    expect(out.displayOrder).toEqual(['gB', 'standalone'])
  })

  it('drops stale ids of the merged workspace from the old order', () => {
    const out = mergeLayoutForKeys(
      { groups: [], displayOrder: ['ghost'], sessions: [] },
      [B],
      { groups: [], displayOrder: [] },
      [],
      B
    )
    expect(out.displayOrder).toEqual([])
  })
})

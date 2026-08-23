/**
 * The one-time sidebar-layout migration (PRDCT-1703, invariant 6): the legacy
 * single `sidebar-layout.json` is partitioned into one file per workspace on
 * the first load after the update, every legacy group landing in EXACTLY ONE
 * per-workspace file, and the legacy file is kept as `.migrated-backup`.
 *
 * Seeded like a real pre-update profile: live tmux sessions with their
 * records (so the groups survive the renderer's restore, which drops a group
 * whose sessions are gone), and a legacy layout mixing a stamped group, an
 * unstamped group placed by its cwd, an unstamped group with no usable cwd
 * (fallback: the last-active workspace), and a bare session id in the display
 * order placed by its record. The assertions read the FILES the migration
 * wrote and then the app's own scoped listing.
 *
 * Failure modes this must catch: everything dumped into one workspace, a
 * group dropped or duplicated, the legacy file deleted instead of kept, the
 * display order not following its items.
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  callMcp,
  killLeakedE2eTmux
} from './harness.mjs'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = userDataDir('multi-window-migration')
const ROOT_A = '/tmp/clave-e2e-mw-mig-a'
const ROOT_B = '/tmp/clave-e2e-mw-mig-b'
const WS_A = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  name: 'MigA',
  rootDir: ROOT_A,
  profileFile: null,
  createdAt: 1
}
const WS_B = {
  id: 'bbbbbbbb-0000-4000-8000-0000000000b2',
  name: 'MigB',
  rootDir: ROOT_B,
  profileFile: null,
  createdAt: 1
}

const SESS = {
  a: {
    id: '11111111-0000-4000-8000-000000000001',
    tmux: 'clave-e2e-mig-a',
    cwd: ROOT_A,
    workspaceId: WS_A.id
  },
  b: {
    id: '22222222-0000-4000-8000-000000000002',
    tmux: 'clave-e2e-mig-b',
    cwd: ROOT_B,
    workspaceId: WS_B.id
  },
  c: {
    id: '33333333-0000-4000-8000-000000000003',
    tmux: 'clave-e2e-mig-c',
    cwd: ROOT_A,
    workspaceId: undefined
  },
  x: {
    id: '44444444-0000-4000-8000-000000000004',
    tmux: 'clave-e2e-mig-x',
    cwd: ROOT_B,
    workspaceId: WS_B.id
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function seedLiveSession(s) {
  execFileSync('tmux', ['-L', 'clave', 'new-session', '-d', '-s', s.tmux, '-c', s.cwd])
  const dir = path.join(DIR, 'session-records')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, `${s.tmux}.json`),
    JSON.stringify({
      tmuxName: s.tmux,
      id: s.id,
      cwd: s.cwd,
      folderName: path.basename(s.cwd),
      claudeMode: false,
      antigravityMode: false,
      codexMode: false,
      claudeAgentsMode: false,
      dangerousMode: false,
      ...(s.workspaceId ? { workspaceId: s.workspaceId } : {})
    })
  )
}

const group = (id, name, sessionIds, extra = {}) => ({
  id,
  name,
  sessionIds,
  collapsed: false,
  cwd: null,
  terminals: [],
  ...extra
})

function readLayout(wsId) {
  const f = path.join(DIR, 'sidebar-layouts', `${wsId}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : null
}

export async function run(t) {
  killLeakedE2eTmux()
  mkdirSync(ROOT_A, { recursive: true })
  mkdirSync(ROOT_B, { recursive: true })
  seedWorkspaces(DIR, { workspaces: [WS_A, WS_B], activeWorkspaceId: WS_A.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT_A, ROOT_B])
  for (const s of Object.values(SESS)) seedLiveSession(s)

  const legacy = {
    groups: [
      group('g-stamped', 'Stamped A', [SESS.a.id], { workspaceId: WS_A.id }),
      group('g-bycwd', 'By cwd B', [SESS.b.id], { cwd: ROOT_B }),
      group('g-orphan', 'Orphan', [SESS.c.id], { cwd: '/nowhere/at/all' })
    ],
    displayOrder: [SESS.x.id, 'g-stamped', 'g-bycwd', 'g-orphan']
  }
  const legacyPath = path.join(DIR, 'sidebar-layout.json')
  const legacyText = JSON.stringify(legacy, null, 2)
  writeFileSync(legacyPath, legacyText)

  let app = null
  try {
    const launched = await launchApp(DIR, { settleMs: 7000 })
    app = launched.app

    // ── the files ──
    t.check('the legacy file is gone from its old path', !existsSync(legacyPath))
    const backup = `${legacyPath}.migrated-backup`
    t.check('the legacy file is kept as .migrated-backup', existsSync(backup), backup)
    t.check(
      'the backup is the legacy file byte for byte',
      existsSync(backup) && readFileSync(backup, 'utf-8') === legacyText
    )

    const fileA = readLayout(WS_A.id)
    const fileB = readLayout(WS_B.id)
    t.check('workspace A got a layout file', fileA !== null)
    t.check('workspace B got a layout file', fileB !== null)
    const idsA = (fileA?.groups ?? []).map((g) => g.id).sort()
    const idsB = (fileB?.groups ?? []).map((g) => g.id).sort()
    t.check(
      'the stamped group and the orphan (fallback = last-active A) landed in A',
      JSON.stringify(idsA) === JSON.stringify(['g-orphan', 'g-stamped']),
      idsA
    )
    t.check(
      'the cwd-placed group landed in B',
      JSON.stringify(idsB) === JSON.stringify(['g-bycwd']),
      idsB
    )
    t.check(
      'every group is stamped with the workspace it landed in',
      (fileA?.groups ?? []).every((g) => g.workspaceId === WS_A.id) &&
        (fileB?.groups ?? []).every((g) => g.workspaceId === WS_B.id)
    )
    t.check(
      'the bare session id in the order followed its record to B',
      (fileB?.displayOrder ?? []).includes(SESS.x.id) &&
        !(fileA?.displayOrder ?? []).includes(SESS.x.id),
      { a: fileA?.displayOrder, b: fileB?.displayOrder }
    )
    t.check(
      'the order follows the groups, in the legacy order',
      JSON.stringify(fileA?.displayOrder?.filter((id) => id.startsWith('g-'))) ===
        JSON.stringify(['g-stamped', 'g-orphan']) &&
        JSON.stringify(fileB?.displayOrder?.filter((id) => id.startsWith('g-'))) ===
          JSON.stringify(['g-bycwd']),
      { a: fileA?.displayOrder, b: fileB?.displayOrder }
    )

    // ── the app: each workspace lists exactly its own migrated groups ──
    const inA = await callMcp(app, 'list', { workspace: WS_A.id })
    const inB = await callMcp(app, 'list', { workspace: WS_B.id })
    const namesA = inA.groups.map((g) => g.name).sort()
    const namesB = inB.groups.map((g) => g.name).sort()
    t.check(
      'workspace A shows the stamped group and the orphan',
      JSON.stringify(namesA) === JSON.stringify(['Orphan', 'Stamped A']),
      namesA
    )
    t.check(
      'workspace B shows the cwd-placed group',
      JSON.stringify(namesB) === JSON.stringify(['By cwd B']),
      namesB
    )
    const all = await callMcp(app, 'list', {})
    t.equal('no group was duplicated across workspaces', all.groups.length, 3)
    t.check(
      'every seeded session came back alive',
      Object.values(SESS).every((s) => all.sessions.some((l) => l.id === s.id && l.alive)),
      all.sessions.map((s) => s.id)
    )

    // A second boot must not re-run anything: the backup stays, nothing changes.
    await app.close()
    app = null
    await sleep(1000)
    const again = await launchApp(DIR, { settleMs: 5000 })
    app = again.app
    t.check(
      'a second boot leaves the backup in place (idempotent)',
      existsSync(backup) && !existsSync(legacyPath)
    )
    const listed = await callMcp(app, 'list', {})
    t.equal('and the groups are still three', listed.groups.length, 3)

    for (const s of Object.values(SESS)) {
      await callMcp(app, 'closeSession', { sessionId: s.id }).catch(() => {})
    }
  } finally {
    if (app) await app.close()
    killLeakedE2eTmux()
  }
}

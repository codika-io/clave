/**
 * The session history (PRDCT-1738), end to end.
 *
 * What is really being guarded is the LINK between a closed session and the
 * group it lived in, which nothing durable used to hold: the ledger row is
 * written AT THE PLACEMENT (a tab opened in a group, then moved out and back
 * in, leaves three rows carrying three groups), and the dialog reads that
 * ledger back — group matched by name across relaunches, rows ordered by the
 * last human message read off the transcript's tail, a cleaned-up transcript
 * greyed, a click that spawns `claude --resume <id>` into the group. The
 * resume assertion taps the pty:spawn boundary (PRDCT-1677's spy): the UI
 * can look right while nothing is handed on.
 *
 * Transcripts are seeded under a private root through CLAVE_TRANSCRIPTS_ROOT,
 * never in the real ~/.claude/projects.
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  callMcp,
  spyPtySpawn,
  until,
  killLeakedE2eTmux
} from './harness.mjs'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const DIR = userDataDir('session-history')
const ROOT = '/tmp/clave-e2e-history-root'
const TRANSCRIPTS = '/tmp/clave-e2e-history-transcripts'
const WS = {
  id: 'eeeeeeee-0000-4000-8000-00000000000e',
  name: 'History',
  rootDir: ROOT,
  profileFile: null,
  createdAt: 1
}
const OTHER_WS = 'ffffffff-0000-4000-8000-00000000000f'

/** Same encoding the app uses for a cwd's project dir. */
const projectDir = (cwd) => cwd.replace(/[/.]/g, '-')

function ledgerRow(over) {
  return JSON.stringify({
    v: 1,
    kind: 'placed',
    ts: '2026-08-20T10:00:00.000Z',
    sessionId: 'tab-x',
    claudeSessionId: null,
    name: 'seeded',
    cwd: ROOT,
    mode: 'claude',
    model: null,
    workspaceId: WS.id,
    groupId: 'group-old-alpha',
    groupName: 'Alpha',
    ...over
  })
}

function transcript(lines) {
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
}

function readLedger() {
  const f = path.join(DIR, 'session-history', 'ledger.jsonl')
  if (!existsSync(f)) return []
  // The seed carries a deliberately malformed line (the app must skip it, not
  // choke); this reader skips it too.
  return readFileSync(f, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)]
      } catch {
        return []
      }
    })
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  rmSync(TRANSCRIPTS, { recursive: true, force: true })
  const pdir = path.join(TRANSCRIPTS, projectDir(ROOT))
  mkdirSync(pdir, { recursive: true })

  // Three conversations that lived in an "Alpha" group under an OLD group id
  // (the group has since been relaunched), one in "Beta", one in another
  // workspace. `alpha-2` was opened first but spoken to last; `alpha-1` the
  // reverse — so "last message" and "opened" order them differently.
  // `alpha-gone` has no transcript on disk any more.
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])
  mkdirSync(path.join(DIR, 'session-history'), { recursive: true })
  writeFileSync(
    path.join(DIR, 'session-history', 'ledger.jsonl'),
    [
      ledgerRow({ ts: '2026-08-20T08:00:00.000Z', sessionId: 'tab-gone', claudeSessionId: 'cc-alpha-gone', name: 'gone session' }),
      ledgerRow({ ts: '2026-08-20T09:00:00.000Z', sessionId: 'tab-2', claudeSessionId: 'cc-alpha-2', name: 'second alpha' }),
      ledgerRow({ ts: '2026-08-20T11:00:00.000Z', sessionId: 'tab-1', claudeSessionId: 'cc-alpha-1', name: 'first alpha' }),
      ledgerRow({ ts: '2026-08-20T11:30:00.000Z', sessionId: 'tab-1', claudeSessionId: 'cc-alpha-1', name: 'first alpha', kind: 'closed' }),
      ledgerRow({ ts: '2026-08-20T12:00:00.000Z', sessionId: 'tab-b', claudeSessionId: 'cc-beta-1', name: 'beta work', groupId: 'group-old-beta', groupName: 'Beta' }),
      ledgerRow({ ts: '2026-08-20T13:00:00.000Z', sessionId: 'tab-o', claudeSessionId: 'cc-other', name: 'elsewhere', workspaceId: OTHER_WS }),
      'not json at all'
    ].join('\n') + '\n'
  )
  writeFileSync(
    path.join(pdir, 'cc-alpha-1.jsonl'),
    transcript([
      { type: 'user', timestamp: '2026-08-21T10:00:00.000Z', message: { content: 'Fix the login bug' } },
      { type: 'ai-title', aiTitle: 'Login bug fix' },
      { type: 'assistant', timestamp: '2026-08-21T10:04:00.000Z', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/src/auth/passkey-guard.ts' } }] } },
      { type: 'user', timestamp: '2026-08-21T10:05:00.000Z', toolUseResult: true, message: { content: [{ type: 'tool_result', content: 'ok' }] } },
      { type: 'last-prompt', lastPrompt: 'Fix the login bug' }
    ])
  )
  writeFileSync(
    path.join(pdir, 'cc-alpha-2.jsonl'),
    transcript([
      { type: 'user', timestamp: '2026-08-22T10:00:00.000Z', message: { content: 'Add the export button' } },
      { type: 'ai-title', aiTitle: 'Export button' },
      { type: 'user', timestamp: '2026-08-23T09:00:00.000Z', message: { content: [{ type: 'text', text: 'Now wire the CSV download' }] } },
      { type: 'assistant', timestamp: '2026-08-23T09:01:00.000Z', message: { content: [{ type: 'thinking', thinking: 'papaparse would do' }, { type: 'text', text: 'Wired the download through papaparse.' }] } },
      { type: 'last-prompt', lastPrompt: 'Now wire the CSV download' }
    ])
  )
  writeFileSync(
    path.join(pdir, 'cc-beta-1.jsonl'),
    transcript([
      { type: 'user', timestamp: '2026-08-22T12:00:00.000Z', message: { content: 'Beta things' } },
      { type: 'ai-title', aiTitle: 'Beta things' },
      { type: 'last-prompt', lastPrompt: 'Beta things' }
    ])
  )

  const { app, win } = await launchApp(DIR, { env: { CLAVE_TRANSCRIPTS_ROOT: TRANSCRIPTS } })
  try {
    // --- The ledger is written at the placement, whatever the mutator ---
    const created = await callMcp(app, 'createGroup', { name: 'Alpha' })
    const liveGroupId = created.groupId
    t.check('a live group named like the old one exists (new id)', !!liveGroupId && liveGroupId !== 'group-old-alpha', liveGroupId)
    const opened = await callMcp(app, 'openSession', { groupId: liveGroupId, mode: 'terminal', cwd: ROOT, name: 'shell in alpha' })
    const tabId = opened.sessionId ?? opened.id
    t.check('a terminal opened inside the group', !!tabId, opened)
    // A second tab keeps the group alive while the first is moved out: a
    // group emptied by a move is dropped, by design.
    await callMcp(app, 'openSession', { groupId: liveGroupId, mode: 'terminal', cwd: ROOT, name: 'anchor' })

    const placedIn = await until(() => {
      const r = readLedger().find((row) => row.sessionId === tabId && row.groupId === liveGroupId)
      return r ?? null
    })
    t.check('opening a tab in a group writes a placed row carrying the group', !!placedIn, readLedger().filter((r) => r.sessionId === tabId))
    t.equal('the row names the group', placedIn?.groupName, 'Alpha')
    t.equal('a terminal has no transcript id', placedIn?.claudeSessionId, null)
    t.equal('the row is stamped with the workspace', placedIn?.workspaceId, WS.id)

    await callMcp(app, 'moveSession', { sessionId: tabId, groupId: 'root' })
    const movedOut = await until(() => readLedger().find((row) => row.sessionId === tabId && row.groupId === null) ?? null)
    t.check('moving the tab OUT of the group is a row at the move (group null)', !!movedOut)
    await callMcp(app, 'moveSession', { sessionId: tabId, groupId: liveGroupId })
    const movedBack = await until(() => {
      const rows = readLedger().filter((row) => row.sessionId === tabId && row.groupId === liveGroupId)
      return rows.length >= 2 ? rows : null
    })
    t.check('moving it back in is another row — the drag-later case is recorded', !!movedBack)

    // --- Right-click the group → History, preselected ---
    await win.click(`[data-sidebar-item-id="${liveGroupId}"] > button`, { button: 'right' })
    await win.waitForTimeout(350)
    const menuLabels = await win.evaluate(() =>
      [...document.querySelectorAll('.menu-surface .menu-item')].map((el) => el.textContent?.trim() ?? '')
    )
    t.check("the group's context menu carries History", menuLabels.some((l) => l.startsWith('History')), menuLabels)
    await win.locator('.menu-surface .menu-item', { hasText: 'History' }).click()
    await win.waitForSelector('[data-history-dialog]', { timeout: 5000 })
    await win.waitForSelector('[data-history-row]', { timeout: 5000 })
    const state = await win.evaluate(() => ({
      chip: document.querySelector('[data-history-chip][data-selected="true"]')?.getAttribute('data-history-chip') ?? null,
      rows: [...document.querySelectorAll('[data-history-row]')].map((el) => el.getAttribute('data-history-row')),
      titles: [...document.querySelectorAll('[data-history-row] .history-row-title')].map((el) => el.textContent),
      prompts: [...document.querySelectorAll('[data-history-row] .history-row-prompt')].map((el) => el.textContent),
      missing: [...document.querySelectorAll('[data-history-row][data-missing="true"]')].map((el) => el.getAttribute('data-history-row'))
    }))
    t.equal('the dialog opens with the group chip preselected', state.chip, liveGroupId)
    t.equal(
      'the group (matched by NAME across its relaunch) lists its sessions, last human message first',
      JSON.stringify(state.rows),
      JSON.stringify(['cc-alpha-2', 'cc-alpha-1', 'cc-alpha-gone'])
    )
    t.check('Beta and the other workspace are not in it', !state.rows.includes('cc-beta-1') && !state.rows.includes('cc-other'))
    t.equal("a row's title is Claude Code's own ai-title", state.titles[0], 'Export button')
    t.equal('a row shows the last prompt from the transcript tail', state.prompts[0], 'Now wire the CSV download')
    t.equal('the ledger name stands in when there is no transcript', state.titles[2], 'gone session')
    t.equal('a cleaned-up transcript is greyed', JSON.stringify(state.missing), JSON.stringify(['cc-alpha-gone']))

    // --- Sort and filter ---
    await win.click('[data-history-sort="opened"]')
    const byOpened = await win.evaluate(() => [...document.querySelectorAll('[data-history-row]')].map((el) => el.getAttribute('data-history-row')))
    t.equal('sorting by Opened orders by first sighting', JSON.stringify(byOpened), JSON.stringify(['cc-alpha-1', 'cc-alpha-2', 'cc-alpha-gone']))
    await win.click('[data-history-sort="last"]')
    await win.fill('[data-history-filter]', 'csv')
    const filtered = await win.evaluate(() => [...document.querySelectorAll('[data-history-row]')].map((el) => el.getAttribute('data-history-row')))
    t.equal('the filter matches the last prompt', JSON.stringify(filtered), JSON.stringify(['cc-alpha-2']))
    await win.fill('[data-history-filter]', '')

    // --- The transcript search: each scope reads only its own kind of text ---
    const rowsAndHits = () =>
      win.evaluate(() => ({
        rows: [...document.querySelectorAll('[data-history-row]')].map((el) => el.getAttribute('data-history-row')),
        hits: [...document.querySelectorAll('[data-history-hit]')].map((el) => el.textContent),
        footer: document.querySelector('[data-history-footer]')?.textContent ?? ''
      }))
    // Wait for THIS search: the debounce has to fire and the footer must
    // settle on a hit count, or the empty state must name this scope and
    // query — the previous search's message would otherwise be read as an
    // answer.
    const searched = async (scope, q) => {
      await win.waitForTimeout(400)
      return until(async () => {
        const r = await rowsAndHits()
        if (/Searching/.test(r.footer)) return null
        const listText = await win.evaluate(() => document.querySelector('[data-history-list]')?.textContent ?? '')
        if (/\d+ hits? in/.test(r.footer) && r.rows.length > 0) return r
        if (listText.includes(`Nothing in the ${scope} messages matches "${q}"`)) return r
        return null
      })
    }
    await win.click('[data-history-scope="human"]')
    await win.fill('[data-history-filter]', 'csv')
    let r = await searched('human', 'csv')
    t.equal('Human scope: the query is found in what the human typed', JSON.stringify(r?.rows), JSON.stringify(['cc-alpha-2']))
    t.check('the row shows the matching excerpt', (r?.hits ?? []).some((h) => h?.includes('CSV download')), r?.hits)
    t.check('the footer counts the hits', /1 hit in 1 of \d+ transcripts?/.test(r?.footer ?? ''), r?.footer)

    await win.fill('[data-history-filter]', 'papaparse')
    r = await searched('human', 'papaparse')
    t.equal('a word only the agent said is not a Human hit', JSON.stringify(r?.rows), JSON.stringify([]))
    await win.click('[data-history-scope="agent"]')
    r = await searched('agent', 'papaparse')
    t.equal('Agent scope finds it (in the answer, never the thinking)', JSON.stringify(r?.rows), JSON.stringify(['cc-alpha-2']))
    t.check('with the excerpt marked', (r?.hits ?? []).some((h) => h?.includes('papaparse')), r?.hits)

    await win.fill('[data-history-filter]', 'passkey-guard')
    r = await searched('agent', 'passkey-guard')
    t.equal('a path only in a tool input is not an Agent hit', JSON.stringify(r?.rows), JSON.stringify([]))
    await win.click('[data-history-scope="tools"]')
    r = await searched('tools', 'passkey-guard')
    t.equal('Tools scope finds it', JSON.stringify(r?.rows), JSON.stringify(['cc-alpha-1']))

    await win.click('[data-history-scope="titles"]')
    await win.fill('[data-history-filter]', '')
    await win.click('[data-history-chip="all"]')
    const all = await win.evaluate(() => [...document.querySelectorAll('[data-history-row]')].map((el) => el.getAttribute('data-history-row')))
    t.check('All shows Beta too, never the other workspace', all.includes('cc-beta-1') && !all.includes('cc-other'), all)
    await win.click(`[data-history-chip="${liveGroupId}"]`)

    // --- Resume: the spawn carries --resume <id>, and the tab lands in the group ---
    const readSpawns = await spyPtySpawn(app)
    await win.click('[data-history-row="cc-alpha-2"]')
    await win.waitForTimeout(800)
    const spawns = await readSpawns()
    t.equal('clicking a row issues exactly one spawn', spawns.length, 1)
    t.equal('the spawn resumes the row\'s conversation', spawns[0]?.resumeSessionId, 'cc-alpha-2')
    t.check('as a Claude session, without skipping permissions', spawns[0]?.claudeMode === true && spawns[0]?.dangerousMode === false, spawns[0])
    t.equal("in the conversation's own cwd", spawns[0]?.cwd, ROOT)
    t.check('the dialog closed on the click', await win.evaluate(() => !document.querySelector('[data-history-dialog]')))
    const placed = await until(async () => {
      const list = await callMcp(app, 'list', {})
      const s = list.sessions.find((x) => x.groupId === liveGroupId && x.name === 'Export button')
      return s ?? null
    })
    t.check('the resumed tab is placed in the selected group, named by its title', !!placed, placed)
    if (placed) {
      const stamped = await until(() => readLedger().find((r) => r.sessionId === placed.id && r.claudeSessionId === 'cc-alpha-2' && r.groupId === liveGroupId) ?? null)
      t.check('and the resume itself is a ledger row in that group', !!stamped)
    }

    // --- The gone row cannot resume ---
    await win.keyboard.press('Meta+Shift+H')
    await win.waitForSelector('[data-history-dialog]', { timeout: 5000 })
    t.equal('⌘⇧H opens on All', await win.evaluate(() => document.querySelector('[data-history-chip][data-selected="true"]')?.getAttribute('data-history-chip')), 'all')
    await win.waitForSelector('[data-history-row="cc-alpha-gone"]', { timeout: 5000 })
    await win.click('[data-history-row="cc-alpha-gone"]')
    await win.waitForTimeout(500)
    t.equal('a row whose transcript is gone spawns nothing', (await readSpawns()).length, 1)
    await win.keyboard.press('Escape')
    await win.waitForTimeout(300)
    t.check('Escape closes the dialog', await win.evaluate(() => !document.querySelector('[data-history-dialog]')))
  } finally {
    await app.close()
    killLeakedE2eTmux()
  }
}

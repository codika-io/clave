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
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
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

/** Every session record on disk (the tmux sidecars), so a spec can read a
 *  record's transcript id. */
function sessionRecords() {
  const dir = path.join(DIR, 'session-records')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf-8')))
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
  // A conversation Clave never ran (no ledger row), in this workspace's
  // root — the Everything toggle's material — and one in a FOREIGN root,
  // which the workspace scoping must keep out even under Everything.
  writeFileSync(
    path.join(pdir, 'cc-outside.jsonl'),
    transcript([
      { type: 'user', timestamp: '2026-08-24T08:00:00.000Z', cwd: ROOT, message: { content: 'Ran from a plain terminal' } },
      { type: 'ai-title', aiTitle: 'Outside conversation' },
      { type: 'last-prompt', lastPrompt: 'Ran from a plain terminal' }
    ])
  )
  const foreignDir = path.join(TRANSCRIPTS, projectDir('/tmp/clave-e2e-foreign-root'))
  mkdirSync(foreignDir, { recursive: true })
  writeFileSync(
    path.join(foreignDir, 'cc-foreign.jsonl'),
    transcript([
      { type: 'user', timestamp: '2026-08-24T08:00:00.000Z', cwd: '/tmp/clave-e2e-foreign-root', message: { content: 'Foreign workspace' } },
      { type: 'ai-title', aiTitle: 'Foreign conversation' },
      { type: 'last-prompt', lastPrompt: 'Foreign workspace' }
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

    // --- A /clear rotates the transcript id: record and store both follow ---
    await win.evaluate((id) => window.electronAPI.setSessionClaudeSessionId(id, 'rotated-0001'), tabId)
    const rec1 = await until(() => sessionRecords().find((r) => r.id === tabId && r.claudeSessionId === 'rotated-0001') ?? null)
    t.check('the session record on disk carries the rotated transcript id', !!rec1, sessionRecords().find((r) => r.id === tabId))
    await win.evaluate((id) => window.electronAPI.setSessionClaudeSessionId(id, '../evil'), tabId)
    await win.waitForTimeout(300)
    t.equal('an id outside the alphabet is refused by the record', sessionRecords().find((r) => r.id === tabId)?.claudeSessionId, 'rotated-0001')
    // The renderer half: the clear-detected event, sent the way main sends
    // it, lands the new id in the store — visible as a ledger row.
    await callMcp(app, 'focus', { sessionId: tabId })
    await win.waitForTimeout(400)
    await app.evaluate(({ BrowserWindow }, { id, stem }) => {
      BrowserWindow.getAllWindows()[0].webContents.send(`session:clear-detected:${id}`, stem)
    }, { id: tabId, stem: 'rotated-0002' })
    const rotatedRow = await until(() => readLedger().find((r) => r.sessionId === tabId && r.claudeSessionId === 'rotated-0002') ?? null)
    t.check('the store follows the rotation: a ledger row carries the new id', !!rotatedRow)
    await app.evaluate(({ BrowserWindow }, { id, stem }) => {
      BrowserWindow.getAllWindows()[0].webContents.send(`session:clear-detected:${id}`, stem)
    }, { id: tabId, stem: 'bad/../stem' })
    await win.waitForTimeout(400)
    // Not merely "the bad string is absent": the ledger normalizer scrubs
    // any out-of-alphabet id to null on the way in, so the observable is the
    // tab KEEPING its previous id — a scrubbed row would say null.
    const lastRow = readLedger().filter((r) => r.sessionId === tabId).pop()
    t.equal('an invalid stem never reaches the store: the tab keeps its id', lastRow?.claudeSessionId, 'rotated-0002')

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

    // A superseded search is cancelled: the dialog sends history:search-cancel
    // with its per-window request id the moment the query changes.
    await app.evaluate(({ ipcMain }) => {
      globalThis.__e2eCancels = []
      ipcMain.on('history:search-cancel', (_e, id) => globalThis.__e2eCancels.push(id))
    })
    await win.fill('[data-history-filter]', 'passkey')
    await win.waitForTimeout(400)
    await win.fill('[data-history-filter]', 'passkey-gu')
    await win.waitForTimeout(600)
    const cancels = await app.evaluate(() => globalThis.__e2eCancels ?? [])
    t.check('changing the query cancels the superseded search', cancels.length >= 1, cancels)
    t.check('with a per-window request id', cancels.every((id) => /^history-[a-z0-9]+-\d+$/.test(id)), cancels)

    // Bounded to the rows in scope: a word only in Beta's transcript is not
    // found while the Alpha chip is selected, and only Alpha's two
    // transcripts were read (the gone one has none).
    await win.click('[data-history-scope="human"]')
    await win.fill('[data-history-filter]', 'Beta things')
    r = await searched('human', 'Beta things')
    t.equal('a group search never reads outside the group', JSON.stringify(r?.rows), JSON.stringify([]))
    t.equal('and it read exactly the group\'s transcripts', r?.footer, '0 hits in 0 of 2 transcripts')

    await win.click('[data-history-scope="titles"]')
    await win.fill('[data-history-filter]', '')
    await win.click('[data-history-chip="all"]')
    const all = await win.evaluate(() => [...document.querySelectorAll('[data-history-row]')].map((el) => el.getAttribute('data-history-row')))
    t.check('All shows Beta too, never the other workspace', all.includes('cc-beta-1') && !all.includes('cc-other'), all)
    await win.click(`[data-history-chip="${liveGroupId}"]`)

    // --- Resume: the spawn carries --resume <id>, and the tab lands in the group ---
    // Another group holds the selection: `addSession` would nest a new tab
    // there, and the ledger would record the conversation as having lived
    // in it. The resume must place the tab where it is told, in one step.
    const zeta = await callMcp(app, 'createGroup', { name: 'Zeta' })
    const zetaTab = await callMcp(app, 'openSession', { groupId: zeta.groupId, mode: 'terminal', cwd: ROOT, name: 'zeta shell' })
    await callMcp(app, 'focus', { sessionId: zetaTab.sessionId })
    await win.waitForTimeout(400)
    // And the target group's web view is on screen (every project group
    // here carries a board): the resume must reveal the terminal, not spawn
    // and place the conversation under the board.
    writeFileSync(path.join(ROOT, 'board.html'), '<!doctype html><title>board</title><p>board</p>')
    await callMcp(app, 'setGroupView', { groupId: liveGroupId, url: path.join(ROOT, 'board.html') })
    await win.keyboard.press('Escape')
    await win.waitForTimeout(300)
    await win.click(`[data-sidebar-item-id="${liveGroupId}"] > button`, { button: 'right' })
    await win.waitForTimeout(350)
    await win.locator('.menu-surface .menu-item', { hasText: 'Show web view' }).click()
    await win.waitForTimeout(500)
    t.check("the group's web view covers the pane", await win.evaluate(() => !!document.querySelector('iframe, webview')))
    await win.click(`[data-sidebar-item-id="${liveGroupId}"] > button`, { button: 'right' })
    await win.waitForTimeout(350)
    await win.locator('.menu-surface .menu-item', { hasText: 'History' }).click()
    await win.waitForSelector('[data-history-row="cc-alpha-2"]', { timeout: 5000 })
    const readSpawns = await spyPtySpawn(app)
    await win.click('[data-history-row="cc-alpha-2"]')
    await win.waitForTimeout(800)
    const spawns = await readSpawns()
    t.equal('clicking a row issues exactly one spawn', spawns.length, 1)
    t.equal('the spawn resumes the row\'s conversation', spawns[0]?.resumeSessionId, 'cc-alpha-2')
    t.check('as a Claude session, without skipping permissions', spawns[0]?.claudeMode === true && spawns[0]?.dangerousMode === false, spawns[0])
    t.equal("in the conversation's own cwd", spawns[0]?.cwd, ROOT)
    t.check('the dialog closed on the click', await win.evaluate(() => !document.querySelector('[data-history-dialog]')))
    t.check('and the resume revealed the terminal: the web view no longer covers the pane', await win.evaluate(() => !document.querySelector('iframe, webview')))
    const placed = await until(async () => {
      const list = await callMcp(app, 'list', {})
      const s = list.sessions.find((x) => x.groupId === liveGroupId && x.name === 'Export button')
      return s ?? null
    })
    t.check('the resumed tab is placed in the selected group, named by its title', !!placed, placed)
    if (placed) {
      const stamped = await until(() => readLedger().find((r) => r.sessionId === placed.id && r.claudeSessionId === 'cc-alpha-2' && r.groupId === liveGroupId) ?? null)
      t.check('and the resume itself is a ledger row in that group', !!stamped)
      const rows = readLedger().filter((r) => r.sessionId === placed.id)
      t.check('and NO row ever claims it lived in the group that held the selection', !rows.some((r) => r.groupId === zeta.groupId), rows.map((r) => r.groupName))
    }

    // --- The gone row cannot resume ---
    await win.keyboard.press('Meta+Shift+H')
    await win.waitForSelector('[data-history-dialog]', { timeout: 5000 })
    t.equal('⌘⇧H opens on All', await win.evaluate(() => document.querySelector('[data-history-chip][data-selected="true"]')?.getAttribute('data-history-chip')), 'all')
    await win.waitForSelector('[data-history-row="cc-alpha-gone"]', { timeout: 5000 })
    await win.click('[data-history-row="cc-alpha-gone"]')
    await win.waitForTimeout(500)
    t.equal('a row whose transcript is gone spawns nothing', (await readSpawns()).length, 1)
    t.check('and leaves the dialog open', await win.evaluate(() => !!document.querySelector('[data-history-dialog]')))

    // --- Escape with a row's menu open dismisses the menu, not the dialog ---
    await win.click('[data-history-row="cc-alpha-1"]', { button: 'right' })
    await win.waitForTimeout(350)
    t.check('the row menu opened above the dialog', await win.evaluate(() => !!document.querySelector('.menu-surface')))
    await win.keyboard.press('Escape')
    await win.waitForTimeout(400)
    t.check('Escape closed the menu', await win.evaluate(() => !document.querySelector('.menu-surface')))
    t.check('and left the dialog open', await win.evaluate(() => !!document.querySelector('[data-history-dialog]')))

    // --- From All, a resume lands in the group the conversation last lived in ---
    await callMcp(app, 'focus', { sessionId: zetaTab.sessionId })
    await win.waitForTimeout(300)
    await win.click('[data-history-row="cc-alpha-1"]')
    await win.waitForTimeout(800)
    const spawnsAll = await readSpawns()
    t.equal('the row resumes its conversation', spawnsAll[1]?.resumeSessionId, 'cc-alpha-1')
    const placedAll = await until(async () => {
      const list = await callMcp(app, 'list', {})
      return list.sessions.find((x) => x.name === 'Login bug fix') ?? null
    })
    t.equal('and lands in the live group named like the one it lived in, not the ambient one', placedAll?.groupId, liveGroupId)
    if (placedAll) {
      const rows = await until(() => {
        const all = readLedger().filter((r) => r.sessionId === placedAll.id)
        return all.length > 0 ? all : null
      })
      t.check('its ledger rows name that group only', !!rows && rows.every((r) => r.groupId === liveGroupId), rows?.map((r) => r.groupName))
    }

    // --- Everything: the whole store, scoped by each conversation's own cwd ---
    await win.keyboard.press('Meta+Shift+H')
    await win.waitForSelector('[data-history-row]', { timeout: 5000 })
    const rowIds = () => win.evaluate(() => [...document.querySelectorAll('[data-history-row]')].map((el) => el.getAttribute('data-history-row')))
    t.check('by default the store-only conversation is not listed', !(await rowIds()).includes('cc-outside'))
    await win.click('[data-history-all]')
    await win.waitForSelector('[data-history-row="cc-outside"]', { timeout: 10000 })
    const allIds = await rowIds()
    t.check('Everything lists the conversation Clave never ran', allIds.includes('cc-outside'))
    t.check('but not one whose own cwd is another root', !allIds.includes('cc-foreign'), allIds)
    t.equal('titled by its own ai-title', await win.evaluate(() => document.querySelector('[data-history-row="cc-outside"] .history-row-title')?.textContent), 'Outside conversation')
    t.check('every closed row wears the hollow dot', await win.evaluate(() => [...document.querySelectorAll('[data-history-row]:not([data-live])')].every((el) => el.getAttribute('data-state') === 'closed')))

    // --- Open: only conversations open as a tab right now ---
    await win.click('[data-history-open]')
    await win.waitForTimeout(300)
    const openRows = await win.evaluate(() => [...document.querySelectorAll('[data-history-row]')].map((el) => ({ id: el.getAttribute('data-history-row'), live: el.hasAttribute('data-live') })))
    t.check('the Open filter keeps only live rows', openRows.every((r) => r.live), openRows)
    t.check('and the closed store-only conversation is gone', !openRows.some((r) => r.id === 'cc-outside'))
    await win.click('[data-history-open]')
    await win.waitForTimeout(200)

    // --- A store-only conversation resumes like any other ---
    const spawnsBefore = (await readSpawns()).length
    await win.click('[data-history-row="cc-outside"]')
    await win.waitForTimeout(800)
    const outsideSpawn = (await readSpawns())[spawnsBefore]
    t.equal('clicking it resumes the outside conversation', outsideSpawn?.resumeSessionId, 'cc-outside')
    t.equal("in the conversation's own folder", outsideSpawn?.cwd, ROOT)

    await win.keyboard.press('Meta+Shift+H')
    await win.waitForSelector('[data-history-dialog]', { timeout: 5000 })
    await win.keyboard.press('Escape')
    await win.waitForTimeout(300)
    t.check('Escape closes the dialog', await win.evaluate(() => !document.querySelector('[data-history-dialog]')))
  } finally {
    await app.close()
    killLeakedE2eTmux()
  }
}

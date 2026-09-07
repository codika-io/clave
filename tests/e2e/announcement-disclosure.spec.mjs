/**
 * The two announcement cards in the sidebar, and the changelog folded inside
 * each of them.
 *
 * Both cards were failing the same user in opposite directions. The what's-new
 * card printed the whole release note — several paragraphs — at a user who had
 * not asked for it. The update card asked for a 220 MB download and a restart
 * while naming nothing but a version number, because the note for a version
 * ships INSIDE that version's binary: `help/whats-new.json` is stamped at build
 * time, so the running app has no local note for the update on offer. The
 * GitHub release bodies that arrive on `update-available` are the only
 * changelog it can have before installing.
 *
 * What is asserted here, and why each one is measured rather than read off a
 * class name:
 *
 *  1. Both cards are COLLAPSED at rest. Asserted on the rendered geometry of
 *     the note — a card that mounts open is the unbounded card again with a
 *     chevron on it, and `defaultOpen={false}` in the source proves nothing
 *     about what mounted.
 *  2. The disclosure actually opens, and what appears is the release text.
 *     Asserted on the note's own words, not on the element existing: an
 *     expanded box containing nothing is exactly the failure mode being
 *     guarded against.
 *  3. The open note is CAPPED and SCROLLS. This is the bug
 *     `sidebar-whats-new.spec.mjs` was written for, and expanding is precisely
 *     where it comes back: these cards live in the sidebar's `flex-shrink-0`
 *     announcements block, so an unbounded one pushes the session list and the
 *     foot panel off the bottom of the window with nothing to scroll. Asserted
 *     on a real scroll and on the card staying inside the viewport.
 *  4. The update card's disclosure is ABSENT, not empty, when the release
 *     carried no notes. A chevron opening onto blank space reads as a broken
 *     control.
 */
import { launchApp, seedWorkspaces, seedTrustedRoots, userDataDir } from './harness.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = userDataDir('announcement-disclosure')
const ROOT = '/tmp/clave-e2e-disclosure-root'
const CLAVE = `${ROOT}/lanes.clave`
const WS = {
  id: 'dddddddd-0000-4000-8000-00000000000d',
  name: 'Notes',
  rootDir: ROOT,
  profileFile: CLAVE,
  createdAt: 1
}

/** A release body of the shape GitHub actually serves for this repo. */
const NOTE_BODY = [
  '### Added',
  '- **Codex usage panel** — see the account reported usage windows and reset times.',
  '- **Codex activity glow** — the icon pulses while Codex works.',
  '',
  '### Changed',
  '- **Usage follows the active agent** — the footer shows the selected session provider.'
].join('\n')

/** Drive the updater store the way the main process does, then read the DOM. */
function pushUpdaterState(win, patch) {
  return win.evaluate((p) => {
    // The store is the seam the banner reads. Reaching it through the app's own
    // module graph rather than a global keeps this honest: if the shape of the
    // state the main process sends ever stops matching what the UI consumes,
    // this goes red rather than passing against a fixture of its own making.
    const store = window.__claveUpdaterStoreForTests
    if (!store) return { ok: false }
    store.setState(p)
    return { ok: true }
  }, patch)
}

function readCard(win, selector) {
  return win.evaluate((sel) => {
    const card = document.querySelector(sel)
    if (!card) return { present: false }
    const toggle = [...card.querySelectorAll('button')].find((b) =>
      /What's changed|Hide details/.test(b.textContent ?? '')
    )
    return {
      present: true,
      hasToggle: !!toggle,
      toggleLabel: toggle?.textContent?.trim() ?? null,
      expanded: toggle?.getAttribute('aria-expanded') ?? null,
      text: (card.textContent ?? '').replace(/\s+/g, ' ').trim()
    }
  }, selector)
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(
    CLAVE,
    JSON.stringify(
      {
        $schema: 'clave/1.0',
        groups: [
          {
            name: 'Lane alpha',
            cwd: '.',
            color: 'teal',
            sessions: [{ cwd: '.', name: 'a', claudeMode: false }]
          }
        ]
      },
      null,
      2
    )
  )
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])

  const { app, win } = await launchApp(DIR)
  try {
    // ── 1. The what's-new card is collapsed, and opens ───────────────────
    const version = await app.evaluate(({ app: a }) => a.getVersion())
    await win.evaluate((v) => {
      localStorage.setItem('clave-whats-new-last-seen-version', `${v}-stale`)
    }, version)
    await win.reload()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForTimeout(4000)

    const wn = await win.evaluate(() => {
      const heading = [...document.querySelectorAll('span')].find((s) =>
        /^New in /.test(s.textContent ?? '')
      )
      if (!heading) return { present: false }
      const card = heading.closest('div.rounded-xl')
      const toggle = [...card.querySelectorAll('button')].find((b) =>
        /What's changed|Hide details/.test(b.textContent ?? '')
      )
      return {
        present: true,
        hasToggle: !!toggle,
        expanded: toggle?.getAttribute('aria-expanded'),
        // The description body must NOT be in the DOM while collapsed.
        cardChars: (card.textContent ?? '').length
      }
    })

    t.check('the what’s-new card is on screen', wn.present === true, wn)
    t.check('it offers a disclosure', wn.hasToggle === true, wn)
    t.check('it is collapsed at rest', wn.expanded === 'false', wn)
    // Guard the guard: collapsed must be genuinely shorter than the note, or
    // "collapsed" is meaningless. The headline alone is a line, not paragraphs.
    t.check(
      'collapsed shows the headline only, not the note',
      wn.cardChars > 0 && wn.cardChars < 400,
      `card renders ${wn.cardChars} chars while collapsed — the body is still in the card`
    )

    // Open it and measure the note that appears.
    const opened = await win.evaluate(() => {
      const heading = [...document.querySelectorAll('span')].find((s) =>
        /^New in /.test(s.textContent ?? '')
      )
      const card = heading.closest('div.rounded-xl')
      const toggle = [...card.querySelectorAll('button')].find((b) =>
        /What's changed/.test(b.textContent ?? '')
      )
      toggle.click()
      return true
    })
    t.check('the disclosure could be clicked', opened === true, opened)
    await win.waitForTimeout(500)

    const wnOpen = await win.evaluate(() => {
      const heading = [...document.querySelectorAll('span')].find((s) =>
        /^New in /.test(s.textContent ?? '')
      )
      const card = heading.closest('div.rounded-xl')
      const toggle = [...card.querySelectorAll('button')].find((b) =>
        /Hide details/.test(b.textContent ?? '')
      )
      // The scrolling box the note lives in.
      const box = [...card.querySelectorAll('div')].find(
        (d) => getComputedStyle(d).overflowY === 'auto' && d.scrollHeight > 0
      )
      let scrolled = null
      if (box) {
        box.scrollTop = 9999
        scrolled = box.scrollTop
        box.scrollTop = 0
      }
      const sidebar = card.closest('.flex.flex-col.h-full')
      return {
        expanded: toggle?.getAttribute('aria-expanded') ?? null,
        label: toggle?.textContent?.trim() ?? null,
        cardChars: (card.textContent ?? '').length,
        hasBox: !!box,
        clientHeight: box?.clientHeight ?? null,
        scrollHeight: box?.scrollHeight ?? null,
        scrolled,
        cardBottom: Math.round(card.getBoundingClientRect().bottom),
        sidebarBottom: sidebar ? Math.round(sidebar.getBoundingClientRect().bottom) : null,
        viewportHeight: window.innerHeight
      }
    })

    t.check('it reports itself expanded', wnOpen.expanded === 'true', wnOpen)
    t.check('the toggle now offers to hide', /Hide details/.test(wnOpen.label ?? ''), wnOpen)
    t.check(
      'the note is now in the card',
      wnOpen.cardChars > wn.cardChars + 200,
      `collapsed ${wn.cardChars} chars → expanded ${wnOpen.cardChars}; the note did not appear`
    )
    t.check('the note has a scrolling box', wnOpen.hasBox === true, wnOpen)
    // The cap, at the moment it matters: with the note OPEN.
    t.check(
      'the open note is capped rather than as tall as its text',
      wnOpen.clientHeight > 0 && wnOpen.scrollHeight > wnOpen.clientHeight + 20,
      wnOpen
    )
    t.check(
      'the cap keeps it a sidebar element, not a screenful',
      wnOpen.clientHeight <= Math.round(wnOpen.viewportHeight * 0.45),
      wnOpen
    )
    // The one that cannot be faked by a class name: the box actually moved.
    t.check(
      'scrolling the open note actually moves it',
      wnOpen.scrolled > 0,
      `scrollTop settled at ${wnOpen.scrolled}`
    )
    t.check(
      'the card stays inside the window with the note open',
      wnOpen.cardBottom <= wnOpen.viewportHeight,
      wnOpen
    )

    // The note must use the card's WIDTH, not share a flex row with the
    // chevron beside it. The first version of this did exactly that — the
    // trigger and the note were wrapped together so "Try it" could sit next to
    // the chevron — and the paragraphs rendered in a column roughly half the
    // card wide, squeezed against the toggle. Every assertion above still
    // passed: the box was capped, it scrolled, and it stayed in the window.
    // Only a width comparison sees it, which is why it is measured here.
    const width = await win.evaluate(() => {
      const heading = [...document.querySelectorAll('span')].find((s) =>
        /^New in /.test(s.textContent ?? '')
      )
      const card = heading.closest('div.rounded-xl')
      const box = [...card.querySelectorAll('div')].find(
        (d) => getComputedStyle(d).overflowY === 'auto'
      )
      return {
        noteWidth: Math.round(box.getBoundingClientRect().width),
        cardWidth: Math.round(card.getBoundingClientRect().width)
      }
    })
    t.check(
      'the open note spans the card rather than a column beside the toggle',
      width.noteWidth >= width.cardWidth * 0.8,
      `note is ${width.noteWidth}px inside a ${width.cardWidth}px card — it is sharing a flex row with the disclosure`
    )

    // Close it again — a disclosure that only opens is half a control.
    const wnClosed = await win.evaluate(() => {
      const heading = [...document.querySelectorAll('span')].find((s) =>
        /^New in /.test(s.textContent ?? '')
      )
      const card = heading.closest('div.rounded-xl')
      const toggle = [...card.querySelectorAll('button')].find((b) =>
        /Hide details/.test(b.textContent ?? '')
      )
      toggle.click()
      return true
    })
    t.check('the open note could be closed', wnClosed === true, wnClosed)
    await win.waitForTimeout(500)
    const wnAfter = await win.evaluate(() => {
      const heading = [...document.querySelectorAll('span')].find((s) =>
        /^New in /.test(s.textContent ?? '')
      )
      const card = heading.closest('div.rounded-xl')
      const toggle = [...card.querySelectorAll('button')].find((b) =>
        /What's changed/.test(b.textContent ?? '')
      )
      return {
        expanded: toggle?.getAttribute('aria-expanded') ?? null,
        cardChars: (card.textContent ?? '').length
      }
    })
    t.check('it collapses again', wnAfter.expanded === 'false', wnAfter)
    t.check(
      'and the note leaves the card with it',
      wnAfter.cardChars < wnOpen.cardChars - 200,
      `still ${wnAfter.cardChars} chars after collapsing (open was ${wnOpen.cardChars})`
    )

    // ── 2. The update card carries the release notes ─────────────────────
    // Dev builds are `supported: false` and never reach the `available` phase,
    // so the state is pushed at the store — the same seam the main process
    // writes through — rather than faked in the DOM.
    const pushed = await pushUpdaterState(win, {
      supported: true,
      phase: 'available',
      availableVersion: '9.9.9',
      releaseNotes: [{ version: '9.9.9', note: NOTE_BODY }],
      dismissed: false
    })
    t.check(
      'the updater store is reachable for the test',
      pushed.ok === true,
      'window.__claveUpdaterStoreForTests is missing — the update card cannot be driven'
    )
    await win.waitForTimeout(600)

    const up = await readCard(win, '[data-testid="update-banner"]')
    t.check('the update card is on screen', up.present === true, up)
    t.check('it names the available version', /9\.9\.9/.test(up.text ?? ''), up)
    t.check('it offers a disclosure', up.hasToggle === true, up)
    t.check('it is collapsed at rest', up.expanded === 'false', up)
    t.check(
      'the notes are not in the card while collapsed',
      !/Codex usage panel/.test(up.text ?? ''),
      up
    )

    await win.evaluate(() => {
      const card = document.querySelector('[data-testid="update-banner"]')
      const toggle = [...card.querySelectorAll('button')].find((b) =>
        /What's changed/.test(b.textContent ?? '')
      )
      toggle.click()
    })
    await win.waitForTimeout(500)

    const upOpen = await readCard(win, '[data-testid="update-banner"]')
    t.check('the update disclosure expands', upOpen.expanded === 'true', upOpen)
    // The point of the whole change: the changelog for a version NOT installed.
    t.check(
      'the release notes are rendered before installing',
      /Codex usage panel/.test(upOpen.text ?? ''),
      upOpen
    )
    t.check(
      'and the whole body is there, not just the first line',
      /Usage follows the active agent/.test(upOpen.text ?? ''),
      upOpen
    )
    // Markdown, not raw source: the bullets and headings must be parsed.
    const md = await win.evaluate(() => {
      const card = document.querySelector('[data-testid="update-banner"]')
      return {
        listItems: card.querySelectorAll('li').length,
        strongs: card.querySelectorAll('strong').length,
        rawHashes: /###/.test(card.textContent ?? '')
      }
    })
    t.check('the notes render as a list, not as raw markdown', md.listItems >= 3, md)
    t.check('the bullet lead-ins render as emphasis', md.strongs >= 3, md)
    t.check('no raw "###" leaks into the card', md.rawHashes === false, md)

    // ── 3. No notes → no disclosure at all ───────────────────────────────
    await pushUpdaterState(win, {
      supported: true,
      phase: 'available',
      availableVersion: '9.9.9',
      releaseNotes: null,
      dismissed: false
    })
    await win.waitForTimeout(500)
    const upNone = await readCard(win, '[data-testid="update-banner"]')
    t.check('the update card still shows without notes', upNone.present === true, upNone)
    t.check(
      'but offers no disclosure to open onto nothing',
      upNone.hasToggle === false,
      `a "What's changed" control is present with releaseNotes: null — it would open onto blank space`
    )
  } finally {
    await app.close()
  }
}

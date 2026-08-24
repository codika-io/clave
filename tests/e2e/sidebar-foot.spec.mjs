/**
 * The sidebar's foot and the wordmark.
 *
 * Three things here fail silently if they break, which is why they are checked
 * against the real app rather than eyeballed:
 *
 *  - The field is a CANVAS. A palette that never reaches the paint routine
 *    leaves a transparent canvas, and a transparent canvas over a dark panel
 *    looks exactly like a dark panel. Every field check reads pixels.
 *  - Sentient is loaded for ONE string. A stylesheet that lets it leak into
 *    another rule shows up as "the app looks a bit different" and nothing else,
 *    so the leak is asserted against, not just the presence.
 *  - The saved profile used to be a hex. A migration that silently drops it
 *    leaves the default palette, which is indistinguishable from a user who
 *    never chose one.
 */
import { launchApp, seedWorkspaces, seedTrustedRoots, userDataDir } from './harness.mjs'
import { mkdirSync } from 'node:fs'

const DIR = userDataDir('sidebar-foot')
const ROOT = '/tmp/clave-e2e-foot-root'
const WS = {
  id: 'ffffffff-0000-4000-8000-00000000000f',
  name: 'Foot',
  rootDir: ROOT,
  profileFile: null,
  createdAt: 1
}

/** Read a canvas back as a coarse signature: how many distinct colours it
 *  holds, and whether any pixel is opaque at all. A field that failed to paint
 *  scores 0 opaque pixels; a flat fill scores 1 colour. */
const CANVAS_STATS = (sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const ctx = el.getContext('2d')
  const { width: w, height: h } = el
  if (!w || !h) return { colours: 0, opaque: 0, w, h }
  const d = ctx.getImageData(0, 0, w, h).data
  const seen = new Set()
  let opaque = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 8) opaque++
    seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3))
  }
  return { colours: seen.size, opaque, w, h, sample: `${d[0]},${d[1]},${d[2]}` }
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])

  let { app, win } = await launchApp(DIR)
  try {
    // ── what a profile nobody has touched looks like ──
    // Read BEFORE anything is seeded, because that is the only moment the
    // defaults are what is on screen. A default that regresses is invisible to
    // every other check here: they all seed a profile first.
    await win.waitForSelector('.sidebar-panel', { timeout: 20000 })
    const fresh = await win.evaluate(() =>
      JSON.parse(localStorage.getItem('clave-user-profile') ?? '{}')
    )
    t.equal('a fresh profile flies the rocket', fresh.avatarIcon, 'rocket')
    t.equal('on the Iris field', fresh.avatarField, 'iris')

    // A profile saved by an older build: a flat hex, no palette, no seed.
    await win.evaluate(() => {
      localStorage.setItem(
        'clave-user-profile',
        JSON.stringify({ name: 'Ada Lovelace', avatarIcon: 'bolt', avatarColor: '#db8b4e' })
      )
      localStorage.setItem('clave-theme', 'dark')
      localStorage.setItem('clave-work-tracker-enabled', 'true')
    })
    await win.evaluate(() => window.electronAPI?.feedbackSetCollapsed?.())
    await win.reload()
    await win.waitForSelector('.sidebar-panel', { timeout: 20000 })

    // ── the foot is ONE panel ──
    const shape = await win.evaluate(() => {
      const foot = document.querySelectorAll('.sidebar-panel')
      const panel = foot[foot.length - 1]
      if (!panel) return null
      const cs = getComputedStyle(panel)
      return {
        rows: panel.querySelectorAll('.sidebar-footer-row').length,
        sep: !!panel.querySelector('.sidebar-footer-sep'),
        field: !!panel.querySelector('canvas.sidebar-footer-field'),
        avatar: !!panel.querySelector('canvas:not(.sidebar-footer-field)'),
        gear: !!panel.querySelector('.sidebar-footer-btn[aria-label="Settings"]'),
        feedback: !!panel.querySelector('.sidebar-footer-btn[aria-label="Talk to us"]'),
        name: panel.querySelector('.sidebar-footer-name')?.textContent,
        border: cs.borderTopWidth,
        radius: cs.borderTopLeftRadius,
        // Nothing may sit loose beside the panel any more.
        siblings: panel.parentElement?.children.length
      }
    })
    t.check('the foot is one panel', shape !== null, shape)
    t.equal('holding two rows', shape?.rows, 2)
    t.check('folded by a hairline', shape?.sep, shape)
    t.check('with the field bled behind it', shape?.field, shape)
    t.check('the avatar is a field of its own', shape?.avatar, shape)
    t.check('the settings gear is in it', shape?.gear, shape)
    t.check('the collapsed feedback door is in it', shape?.feedback, shape)
    t.equal('and it carries the name', shape?.name, 'Ada Lovelace')
    t.equal('it is bordered like the launcher panel', shape?.border, '1px')
    t.equal('and rounded like it', shape?.radius, '10px')
    t.equal('nothing else sits loose at the foot', shape?.siblings, 1)

    // ── the field actually paints ──
    const avatar = await win.evaluate(
      CANVAS_STATS,
      '.sidebar-panel canvas:not(.sidebar-footer-field)'
    )
    t.check('the avatar canvas is opaque', (avatar?.opaque ?? 0) > 0, avatar)
    t.check('and carries a field, not a flat fill', (avatar?.colours ?? 0) > 12, avatar)

    const bleed = await win.evaluate(CANVAS_STATS, 'canvas.sidebar-footer-field')
    t.check('the panel ground paints too', (bleed?.colours ?? 0) > 12, bleed)

    // ── the ground is grained, not faded ──
    // The failure this catches: quietening the field with CSS opacity instead
    // of the veil. That fades the grain with it, and the panel goes from
    // weather to a grey wash — which still passes every check above.
    const ground = await win.evaluate(() => {
      const el = document.querySelector('canvas.sidebar-footer-field')
      const cs = getComputedStyle(el)
      const ctx = el.getContext('2d')
      const { width: w, height: h } = el
      const d = ctx.getImageData(0, 0, w, h).data
      let sum = 0
      let sq = 0
      const n = d.length / 4
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        sum += l
        sq += l * l
      }
      const mean = sum / n
      return {
        opacity: cs.opacity,
        mask: cs.maskImage,
        mean,
        // Per-pixel spread IS the grain: a smooth gradient of this size has
        // almost none, and film has plenty.
        sd: Math.sqrt(Math.max(0, sq / n - mean * mean))
      }
    })
    t.equal('the ground canvas is never faded', ground.opacity, '1')
    t.check('nor masked', ground.mask === 'none', ground.mask)
    t.check('the grain is actually in the pixels', ground.sd > 6, ground)
    t.check('and the ground stays dark under the names', ground.mean < 70, ground)

    // ── the second line: headroom, or nothing worth saying ──
    /** What the foot claims is LEFT, carried down to the pane cross-check. */
    let footLeft = null
    // The store fetches over the network at boot, so the meter arrives a beat
    // after the panel does. Without this wait the spec always read the
    // pre-fetch state and the headroom branch below was never once exercised —
    // it passed, on the fallback, on a machine that had the data all along.
    await win.waitForSelector('.usage-meter', { timeout: 15000 }).catch(() => null)

    const meta = await win.evaluate(() => {
      const rows = document.querySelectorAll('.sidebar-footer-row--meta')
      const row = rows[rows.length - 1]
      if (!row) return null
      const fill = row.querySelector('.usage-meter-fill')
      return {
        text: row.textContent,
        meter: !!row.querySelector('.usage-meter'),
        fillWidth: fill ? fill.style.width : null,
        clock: !!row.querySelector('svg')
      }
    })
    t.check('the foot has a second line', meta !== null, meta)
    // Which branch renders depends on the machine's own Claude session, so the
    // check is on the shape of whichever one did — never on a number, and never
    // on the meaningless zero the old line showed.
    if (meta?.meter) {
      t.check(
        'it reads headroom, as a percentage LEFT',
        /\d+% left/.test(meta.text ?? ''),
        meta.text
      )
      // textContent has no CSS gaps in it, so the separator may sit flush.
      t.check('and names which cap that is', /% left\s*·\s*\S/.test(meta.text ?? ''), meta.text)
      t.check(
        'the meter drains rather than fills',
        /^\d+(\.\d+)?%$/.test(meta.fillWidth ?? ''),
        meta.fillWidth
      )
      const pct = Number((meta.text ?? '').match(/(\d+)% left/)?.[1])
      const width = Number((meta.fillWidth ?? '').replace('%', ''))
      t.check('and agrees with the number beside it', Math.abs(pct - width) <= 3 || width === 3, {
        pct,
        width
      })
      footLeft = pct
    } else {
      t.check(
        'with no limits to show, it never says 0m · 0 sessions',
        !/0m/.test(meta?.text ?? ''),
        meta?.text
      )
    }

    // ── the legacy hex migrated ──
    const migrated = await win.evaluate(() =>
      JSON.parse(localStorage.getItem('clave-user-profile') ?? '{}')
    )
    t.equal('a saved hex resolves to its palette', migrated.avatarField, 'furnace')
    t.check('and the draw is seeded', typeof migrated.avatarSeed === 'number', migrated)

    // ── the wordmark ──
    const wm = await win.evaluate(() => {
      const el = document.querySelector('.wordmark')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        label: el.getAttribute('aria-label'),
        paths: el.querySelectorAll('path').length,
        d: el.querySelector('path')?.getAttribute('d')?.length ?? 0,
        x: r.x,
        h: r.height,
        w: r.width
      }
    })
    t.equal('the wordmark is labelled Clave', wm?.label, 'Clave')
    // Outlines, not type. The face is Fontshare's and may not be redistributed
    // as a file, so a packaged build must not contain one — see Wordmark.tsx.
    t.equal('drawn as an SVG, not set in a face', wm?.tag, 'svg')
    t.check('with real outline data in it', (wm?.d ?? 0) > 500, wm)
    t.check('and clear of the traffic lights', (wm?.x ?? 0) >= 80, wm)
    t.check('at the height it was drawn for', Math.abs((wm?.h ?? 0) - 12.2) < 1.5, wm)
    t.check(
      'keeping the outline ratio',
      Math.abs((wm?.w ?? 0) / (wm?.h ?? 1) - 2464 / 762) < 0.1,
      wm
    )

    // ── and no font file came with it ──
    // The failure this catches: someone reintroducing a Sentient @font-face to
    // make the mark editable. It would look identical and would put an
    // unredistributable file back in the asar.
    const faces = await win.evaluate(() => {
      const named = []
      document.fonts.forEach((f) => named.push(f.family))
      return {
        registered: named,
        // Anything on the page resolving to a face that is not the app's own.
        leaks: Array.from(document.querySelectorAll('body *'))
          .map((el) => getComputedStyle(el).fontFamily)
          .filter((f) => /sentient/i.test(f))
      }
    })
    t.equal(
      'no Sentient face is registered',
      faces.registered.filter((f) => /sentient/i.test(f)).length,
      0
    )
    t.equal('and nothing on the page asks for one', faces.leaks.length, 0)

    // ── choosing a field repaints it ──
    await win.click('.sidebar-footer-btn[aria-label="Settings"]')
    await win.waitForSelector('.settings-row', { timeout: 10000 })
    const swatches = await win.evaluate(
      () => document.querySelectorAll('.settings-row canvas').length
    )
    t.check('the picker offers a painted swatch per palette', swatches >= 12, swatches)

    // The settings view replaces the sidebar, so the foot panel is out of the
    // DOM while the picker is open: the repaint is read on the profile card's
    // own avatar, which is the same component on the same store.
    const AVATAR = '.settings-card canvas'
    const before = await win.evaluate(CANVAS_STATS, AVATAR)
    await win.click('button[title="Aurora"]')
    await new Promise((r) => setTimeout(r, 600))
    const after = await win.evaluate(CANVAS_STATS, AVATAR)
    t.check('picking a palette repaints the avatar', before?.sample !== after?.sample, {
      before: before?.sample,
      after: after?.sample
    })
    t.equal(
      'and the choice is saved',
      (await win.evaluate(() => JSON.parse(localStorage.getItem('clave-user-profile') ?? '{}')))
        .avatarField,
      'aurora'
    )

    const seedBefore = await win.evaluate(
      () => JSON.parse(localStorage.getItem('clave-user-profile') ?? '{}').avatarSeed
    )
    await win.click('button[title="Draw the field again"]')
    await new Promise((r) => setTimeout(r, 600))
    const seedAfter = await win.evaluate(
      () => JSON.parse(localStorage.getItem('clave-user-profile') ?? '{}').avatarSeed
    )
    t.check('redrawing draws a different field', seedBefore !== seedAfter, {
      seedBefore,
      seedAfter
    })
    // ── the foot and the pane are the same number ──
    // The one check that catches the foot showing percent USED under a "left"
    // label: the pane renders percent USED for every window, so the tightest
    // bar there and the foot's headroom must sum to 100. Without this the two
    // readouts can disagree by exactly the mistake that matters.
    if (footLeft !== null) {
      await win.evaluate(() => {
        const nav = Array.from(document.querySelectorAll('button, a'))
        nav.find((el) => el.textContent?.trim() === 'Usage')?.click()
      })
      await win
        .waitForSelector('.settings-card .rounded-full', { timeout: 15000 })
        .catch(() => null)
      const paneMax = await win.evaluate(() => {
        const bars = Array.from(document.querySelectorAll('.settings-card .space-y-1\\.5'))
        const pcts = bars
          .map((b) => Number(b.textContent?.match(/(\d+)%/)?.[1]))
          .filter((n) => Number.isFinite(n))
        return pcts.length ? Math.max(...pcts) : null
      })
      t.check(
        'the pane and the foot describe the same ceiling',
        paneMax !== null && Math.abs(100 - paneMax - footLeft) <= 1,
        { footLeft, paneMax }
      )
    }
  } finally {
    await app.close()
  }
}

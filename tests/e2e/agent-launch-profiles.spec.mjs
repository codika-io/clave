/**
 * Launch profiles and Pi are wired through the real settings UI, preload IPC,
 * main-process persistence, launcher, and keyboard shortcut.
 */
import { mkdirSync } from 'node:fs'
import { agentButtonLabel, launchApp, seedWorkspaces, userDataDir } from './harness.mjs'

const DIR = userDataDir('agent-launch-profiles')
const ROOT = '/tmp/clave-e2e-agent-launch-profiles-root'
const PI_ROOT = '/tmp/clave-e2e-agent-launch-profiles-pi'
const WORKSPACE = {
  id: 'aaaaaaaa-0000-4000-8000-00000000000c',
  name: 'Profiles',
  rootDir: ROOT,
  profileFile: null,
  createdAt: 1
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  seedWorkspaces(DIR, {
    workspaces: [WORKSPACE],
    activeWorkspaceId: WORKSPACE.id,
    fresh: true
  })

  const { app, win } = await launchApp(DIR, {
    env: {
      CLAVE_PI_ROOT: PI_ROOT,
      // Pi's own test-only override keeps the real ~/.pi session store untouched.
      PI_CODING_AGENT_SESSION_DIR: PI_ROOT
    }
  })
  try {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('menu:open-settings-section', 'agents')
    })
    await win.waitForSelector('h2:has-text("Agents")', { timeout: 10_000 })

    const familyNames = await win.locator('.settings-section-title').allTextContents()
    t.check(
      'settings exposes all four agent families as first-class sections',
      ['Claude', 'Antigravity', 'Codex', 'Pi'].every((name) => familyNames.includes(name)),
      familyNames
    )

    const piSection = win.locator('section').filter({
      has: win.locator('.settings-section-title', { hasText: /^Pi$/ })
    })
    await piSection.getByRole('button', { name: 'Add profile' }).click()
    const editor = piSection.locator('.settings-card').last()
    const inputs = editor.locator('input')
    await inputs.nth(0).fill('Pi production')
    await inputs.nth(2).fill('anthropic')
    await inputs.nth(3).fill('claude-sonnet-4')
    await editor.locator('select').selectOption('high')
    await editor.getByRole('button', { name: 'Save profile' }).click()

    const preferences = await win.evaluate(() => window.electronAPI.launchProfilesList())
    const profile = preferences.customProfiles.find(
      (candidate) => candidate.name === 'Pi production'
    )
    t.check(
      'saving the Pi profile crossed renderer IPC and reached main persistence',
      !!profile,
      preferences
    )
    t.equal('the provider is stored as a Pi profile default', profile?.pi?.provider, 'anthropic')
    t.equal('the model is stored as a Pi profile default', profile?.pi?.model, 'claude-sonnet-4')
    t.equal('the thinking level is stored as a Pi profile default', profile?.pi?.thinking, 'high')

    if (profile) {
      await piSection.locator('select').nth(1).selectOption(profile.id)
      const updated = await win.evaluate(() => window.electronAPI.launchProfilesList())
      t.equal(
        'the workspace override is persisted independently from the global default',
        updated.workspaceOverrides[WORKSPACE.id]?.pi,
        profile.id
      )
    }

    await win.getByRole('button', { name: 'Back to sessions' }).click()
    await win.keyboard.press('Meta+Shift+P')
    await win.waitForTimeout(2500)
    t.equal('Cmd+Shift+P launches and remembers Pi', await agentButtonLabel(win), 'Pi')

    await win.click('.launcher-caret')
    const menuText = await win.locator('[role="menu"]').allTextContents()
    t.check(
      'the launcher exposes Pi and its launch profiles',
      menuText.some((text) => text.includes('Pi')),
      menuText
    )
  } finally {
    await app.close()
  }
}

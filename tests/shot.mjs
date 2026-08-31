// Throwaway: open the two new Settings panes in the real app and photograph them.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, rmSync } from 'node:fs'
const DIR = '/tmp/clave-shot-userdata'
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true })
const app = await electron.launch({
  executablePath: 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
  args: ['.', `--user-data-dir=${DIR}`, '--test-no-activate'],
  cwd: process.cwd()
})
const win = await app.firstWindow()
await win.waitForTimeout(5000)
await win.keyboard.press('Meta+,')
await win.waitForTimeout(800)
for (const [name, file] of [['Keymaps', '/tmp/shot-keymaps.png'], ['Agents', '/tmp/shot-agents.png']]) {
  await win.getByRole('button', { name, exact: true }).click()
  await win.waitForTimeout(700)
  await win.screenshot({ path: file })
  console.log(name, '->', file)
}
await app.close()
process.exit(0)

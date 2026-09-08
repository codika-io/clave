import { _electron as electron } from 'playwright-core'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
// Run against an unsigned universal directory build. Both app launches use isolated profiles.
const bundle = process.argv[2]
if (!bundle)
  throw new Error('Usage: node tests/e2e/packaged-signature-smoke.mjs /absolute/path/Clave.app')
const binary = join(bundle, 'Contents/MacOS/Clave')
const binding = join(
  bundle,
  'Contents/Resources/app.asar.unpacked/node_modules/@resvg/resvg-js/resvgjs.darwin-universal.node'
)
execFileSync('/usr/bin/lipo', [binding, '-verify_arch', 'arm64', 'x86_64'])
for (const arch of ['arm64', 'x86_64']) {
  const root = mkdtempSync(join(tmpdir(), 'clave-packed-signature-'))
  const wrapper = join(root, 'launch.sh')
  writeFileSync(
    wrapper,
    `#!/bin/sh\nexec /usr/bin/arch -${arch} ${"'" + binary.replaceAll("'", "'\"'\"'") + "'"} "$@"\n`,
    { mode: 0o755 }
  )
  let app
  try {
    app = await electron.launch({
      executablePath: wrapper,
      args: [`--user-data-dir=${root}/profile`, '--test-no-activate']
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    const result = await app.evaluate(() => {
      const { Resvg } = process.mainModule.require('@resvg/resvg-js')
      const bytes = new Resvg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>',
        { font: { loadSystemFonts: false } }
      )
        .render()
        .asPng()
      return { arch: process.arch, png: Buffer.from(bytes).subarray(0, 8).toString('hex') }
    })
    if (result.png !== '89504e470d0a1a0a' || result.arch !== (arch === 'x86_64' ? 'x64' : arch))
      throw Error('Packaged render failed')
    console.log(JSON.stringify({ packagedStartup: true, ...result }))
  } finally {
    if (app) await app.close()
    rmSync(root, { recursive: true, force: true })
  }
}

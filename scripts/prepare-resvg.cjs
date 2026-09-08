/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- electron-builder hook is plain CommonJS, not TypeScript. */
// npm installs only the host's optional native package. A universal Mac app needs both.
// resvg's published loader supports this local universal binding before platform packages.
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { mkdtempSync, readFileSync, rmSync, renameSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const staged = new Map()
function stage(root) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  const packageDir = join(root, 'node_modules/@resvg/resvg-js')
  const installed = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  const temp = mkdtempSync(join(tmpdir(), 'clave-resvg-universal-'))
  try {
    const binaries = ['arm64', 'x64'].map((arch) => {
      const name = `@resvg/resvg-js-darwin-${arch}`
      const entry = lock.packages[`node_modules/${name}`]
      if (!entry || entry.version !== installed.version || !entry.integrity?.startsWith('sha512-'))
        throw new Error(`Missing matching locked resvg package: ${name}`)
      // npm handles registry authentication, cache and downloads; never resolve a moving version.
      const packed = JSON.parse(
        execFileSync(
          'npm',
          ['pack', entry.resolved, '--ignore-scripts', '--json', '--pack-destination', temp],
          { encoding: 'utf8' }
        )
      )
      const archive = join(temp, packed[0].filename)
      const actual = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64')
      if (actual !== entry.integrity) throw new Error(`resvg archive integrity mismatch: ${name}`)
      const binary = `resvgjs.darwin-${arch}.node`
      // Extract only the known binary member, never arbitrary archive paths or package scripts.
      execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', temp, `package/${binary}`])
      const path = join(temp, 'package', binary)
      execFileSync('/usr/bin/lipo', [path, '-verify_arch', arch === 'x64' ? 'x86_64' : arch])
      return path
    })
    const output = join(temp, 'resvgjs.darwin-universal.node')
    execFileSync('/usr/bin/lipo', ['-create', ...binaries, '-output', output])
    execFileSync('/usr/bin/lipo', [output, '-verify_arch', 'arm64', 'x86_64'])
    renameSync(output, join(packageDir, 'resvgjs.darwin-universal.node'))
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
module.exports = async function beforePack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const root = context.packager.projectDir
  if (!staged.has(root))
    staged.set(
      root,
      Promise.resolve().then(() => stage(root))
    )
  await staged.get(root)
}

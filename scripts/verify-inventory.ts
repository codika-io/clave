// scripts/verify-inventory.ts
import { estimateTokens, contextWindowFor } from '../src/main/inventory/token-estimator'
import * as os from 'os'
import * as path from 'path'
import * as fsSync from 'fs'
import { contentCache } from '../src/main/inventory/content-cache'
import { scanClaudeMd } from '../src/main/inventory/scanners/claude-md'
import { scanSkills } from '../src/main/inventory/scanners/skills'

type Case = { name: string; run: () => void | Promise<void> }
const cases: Case[] = []

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('Assertion failed: ' + msg)
}

cases.push({
  name: 'tokenEstimator',
  run: () => {
    assert(estimateTokens('') === 0, 'empty string -> 0')
    assert(estimateTokens('abcd') === 1, '4 chars -> 1 token')
    assert(estimateTokens('a'.repeat(401)) === 101, '401 chars -> 101 tokens (ceil)')
    assert(contextWindowFor(undefined) === 200000, 'default context window')
    assert(contextWindowFor('claude-opus-4-6') === 200000, 'opus 4.6 context window')
  }
})

cases.push({
  name: 'contentCache',
  run: async () => {
    const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'clave-inv-'))
    const file = path.join(dir, 'x.md')
    fsSync.writeFileSync(file, 'hello', 'utf-8')
    const first = await contentCache.readIfChanged(file)
    assert(first === 'hello', 'first read returns content')
    const second = await contentCache.readIfChanged(file)
    assert(second === 'hello', 'second read returns cached content')
    fsSync.writeFileSync(file, 'world', 'utf-8')
    // bump mtime because some filesystems have 1-second granularity
    const future = new Date(Date.now() + 2000)
    fsSync.utimesSync(file, future, future)
    const third = await contentCache.readIfChanged(file)
    assert(third === 'world', 'post-change read returns new content')
    fsSync.rmSync(dir, { recursive: true, force: true })
  }
})

cases.push({
  name: 'claudeMdScanner',
  run: async () => {
    const root = fsSync.mkdtempSync(path.join(os.tmpdir(), 'clave-claudemd-'))
    const nested = path.join(root, 'sub', 'deep')
    fsSync.mkdirSync(nested, { recursive: true })
    fsSync.writeFileSync(path.join(root, 'CLAUDE.md'), 'a'.repeat(100), 'utf-8')
    fsSync.writeFileSync(path.join(nested, 'CLAUDE.md'), 'b'.repeat(40), 'utf-8')

    const entries = await scanClaudeMd(nested)
    const paths = entries.map((e) => e.filePath)
    assert(paths.some((p) => p?.endsWith(path.join('deep', 'CLAUDE.md'))), 'found deep CLAUDE.md')
    assert(paths.some((p) => p?.endsWith(path.join('CLAUDE.md')) && !p?.includes('deep')), 'found root CLAUDE.md')
    const deep = entries.find((e) => e.filePath?.endsWith(path.join('deep', 'CLAUDE.md')))!
    assert(deep.estimatedTokens === 10, '40 chars -> 10 tokens')
    fsSync.rmSync(root, { recursive: true, force: true })
  }
})

cases.push({
  name: 'skillsScanner',
  run: async () => {
    const entries = await scanSkills()
    for (const e of entries) {
      assert(e.category === 'skills', 'category is skills')
      assert(typeof e.name === 'string' && e.name.length > 0, 'has name')
      assert(e.estimatedTokens >= 0, 'non-negative tokens')
    }
    console.log(`  (found ${entries.length} skills)`)
  }
})

async function main() {
  const filter = process.argv[2]
  const selected = filter ? cases.filter((c) => c.name === filter) : cases
  for (const c of selected) {
    try {
      await c.run()
      console.log(`PASS ${c.name}`)
    } catch (err) {
      console.error(`FAIL ${c.name}:`, err)
      process.exitCode = 1
    }
  }
}

main()

export { cases, assert }

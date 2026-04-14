// scripts/verify-inventory.ts
import { estimateTokens, contextWindowFor } from '../src/main/inventory/token-estimator'
import * as os from 'os'
import * as path from 'path'
import * as fsSync from 'fs'
import { contentCache } from '../src/main/inventory/content-cache'

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

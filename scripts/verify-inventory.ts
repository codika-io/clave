// scripts/verify-inventory.ts
import { estimateTokens, contextWindowFor } from '../src/main/inventory/token-estimator'

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

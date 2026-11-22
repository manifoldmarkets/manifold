import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSportsSharingScope } from './sports-og'

test('scoped sharing needs an existing registered sport and, for a dynamic route, public topic evidence', async () => {
  const oldFlag = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  const oldFetch = globalThis.fetch
  let calls = 0
  let index: unknown
  let failed = false
  globalThis.fetch = async (input, init) => {
    calls++
    assert.match(String(input), /sports-index$/)
    assert.ok(init?.signal)
    if (failed) throw Error('fixture timeout')
    return new Response(JSON.stringify(index))
  }
  try {
    delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    assert.equal(await loadSportsSharingScope('mma'), null)
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
    assert.equal((await loadSportsSharingScope('mma'))?.key, 'mma')
    for (const key of [
      'unknown',
      'other',
      'all',
      'cs',
      'ESPORTS',
      '__proto__',
      null,
      ['golf'],
    ]) {
      assert.equal(await loadSportsSharingScope(key), null)
    }
    assert.equal(calls, 0)
    index = {
      sports: [
        {
          key: 'esports',
          slug: 'esports',
          longLabel: 'Esports',
          groupIds: ['public-topic'],
        },
      ],
    }
    assert.deepEqual(await loadSportsSharingScope('esports'), {
      key: 'esports',
      label: 'Esports',
    })
    for (const sports of [
      [],
      [{ key: 'esports', slug: 'esports', longLabel: 'Esports', groupIds: [] }],
      [
        {
          key: 'esports',
          slug: 'another',
          longLabel: 'Hidden',
          groupIds: ['x'],
        },
      ],
      {},
    ]) {
      index = { sports }
      assert.equal(await loadSportsSharingScope('esports'), null)
    }
    failed = true
    assert.equal(await loadSportsSharingScope('esports'), null)
    assert.equal(calls, 6)
  } finally {
    globalThis.fetch = oldFetch
    if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = oldFlag
  }
})

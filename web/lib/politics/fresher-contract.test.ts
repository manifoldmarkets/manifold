import { test } from 'node:test'
import assert from 'node:assert/strict'

import { Contract } from 'common/contract'
import { fresherContract, snapshotKey } from './fresher-contract'

const market = (over: Partial<Contract>) =>
  ({ id: 'm', lastUpdatedTime: 1000, ...over } as unknown as Contract)

test('the live copy wins until the page brings something newer', () => {
  const page = market({ lastUpdatedTime: 1000 })
  // No update yet, or one for another market: the page's copy.
  assert.equal(fresherContract(undefined, page), page)
  assert.equal(
    fresherContract(market({ id: 'x', lastUpdatedTime: 9e9 }), page),
    page
  )
  // A bet the socket brought after the page loaded.
  const bet = market({ lastUpdatedTime: 2000, lastBetTime: 2000 })
  assert.equal(fresherContract(bet, page), bet)
  // An older page refresh never rolls it back; a tie keeps the live copy.
  assert.equal(fresherContract(bet, market({ lastUpdatedTime: 1500 })), bet)
  assert.equal(fresherContract(bet, market({ lastUpdatedTime: 2000 })), bet)
})

test('a resolution the socket missed arrives with the next refresh', () => {
  const live = market({ lastUpdatedTime: 2000, lastBetTime: 2000 })
  const resolved = market({
    lastUpdatedTime: 3000,
    resolutionTime: 3000,
    isResolved: true,
    resolution: 'pa',
  })
  assert.equal(fresherContract(live, resolved), resolved)
  // A copy with no timestamps never beats one with them.
  assert.equal(fresherContract(live, market({ lastUpdatedTime: NaN })), live)
})

test('a page copy that differs gets a new subscription key', () => {
  const answers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `a${i}` }))
  const base = market({ lastUpdatedTime: 1000, answers: answers(3) } as object)
  const same = market({ lastUpdatedTime: 1000, answers: answers(3) } as object)
  assert.equal(snapshotKey(base), snapshotKey(same))
  // A later change, or an answer added without one, remounts (refetches).
  assert.notEqual(
    snapshotKey(base),
    snapshotKey(
      market({ lastUpdatedTime: 2000, answers: answers(3) } as object)
    )
  )
  assert.notEqual(
    snapshotKey(base),
    snapshotKey(
      market({ lastUpdatedTime: 1000, answers: answers(4) } as object)
    )
  )
})

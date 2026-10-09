import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  explorerSearch,
  isKnownRace,
  normalizeRaceId,
  parseExplorerQuery,
  shareSearch,
} from './explorer-url'

test('race ids normalize to the map Race.id', () => {
  assert.equal(normalizeRaceId('ny-14'), 'NY-14')
  assert.equal(normalizeRaceId('NY14'), 'NY-14')
  assert.equal(normalizeRaceId(' NY 14 '), 'NY-14')
  assert.equal(normalizeRaceId('NY-04'), 'NY-4')
  assert.equal(normalizeRaceId('ak-al'), 'AK-0')
  assert.equal(normalizeRaceId('AK-0'), 'AK-0')
  assert.equal(normalizeRaceId('me'), 'ME')
  assert.equal(normalizeRaceId(['ME', 'NE']), 'ME')
  for (const bad of ['', 'Maine', 'NY-140', 'N', '<script>', undefined])
    assert.equal(normalizeRaceId(bad), undefined, String(bad))
})

test('deep links select the tab and race', () => {
  assert.deepEqual(parseExplorerQuery({ office: 'senate', race: 'ME' }), {
    mode: 'senate',
    race: 'ME',
  })
  assert.deepEqual(parseExplorerQuery({ office: 'House', race: 'ny-14' }), {
    mode: 'house',
    race: 'NY-14',
  })
  assert.deepEqual(parseExplorerQuery({ office: 'governor' }), {
    mode: 'governor',
    race: undefined,
  })
  assert.deepEqual(parseExplorerQuery({ office: 'measures', race: 'CA' }), {
    mode: 'measures',
    race: 'CA',
  })
  // The office is inferred from the race when it is missing.
  assert.deepEqual(parseExplorerQuery({ race: 'TX-2' }), {
    mode: 'house',
    race: 'TX-2',
  })
  assert.deepEqual(parseExplorerQuery({ race: 'ga' }), {
    mode: 'senate',
    race: 'GA',
  })
  // A race that doesn't belong to the tab is dropped; unknown tabs are ignored.
  assert.deepEqual(parseExplorerQuery({ office: 'house', race: 'ME' }), {
    mode: 'house',
    race: undefined,
  })
  assert.deepEqual(parseExplorerQuery({ office: 'senate', race: 'ME-2' }), {
    mode: 'senate',
    race: undefined,
  })
  assert.deepEqual(parseExplorerQuery({ office: 'president' }), {
    mode: undefined,
    race: undefined,
  })
  assert.deepEqual(parseExplorerQuery({}), { mode: undefined, race: undefined })
})

test('the URL carries the tab and race and keeps other parameters', () => {
  assert.equal(explorerSearch('', 'senate'), '')
  assert.equal(explorerSearch('', 'house'), '?office=house')
  assert.equal(explorerSearch('', 'senate', 'ME'), '?office=senate&race=ME')
  assert.equal(
    explorerSearch('?r=dGVzdA&office=house&race=NY-14', 'governor', 'GA'),
    '?r=dGVzdA&office=governor&race=GA'
  )
  assert.equal(
    explorerSearch('?office=house&race=NY-14&r=abc', 'senate'),
    '?r=abc'
  )
  // Round trip: what the explorer writes is what it reads.
  for (const [mode, race] of [
    ['house', 'NY-14'],
    ['house', 'AK-0'],
    ['senate', 'ME'],
    ['governor', 'GA'],
    ['measures', 'CO'],
  ] as const) {
    const params = new URLSearchParams(explorerSearch('', mode, race))
    assert.deepEqual(
      parseExplorerQuery({
        office: params.get('office') ?? undefined,
        race: params.get('race') ?? undefined,
      }),
      { mode, race }
    )
  }
})

test('deep links only open races that exist on that tab', () => {
  assert.equal(isKnownRace('house', 'NY-14'), true)
  assert.equal(isKnownRace('house', 'NY-27'), false)
  assert.equal(isKnownRace('house', 'AK-0'), true)
  assert.equal(isKnownRace('house', 'AK-1'), false)
  assert.equal(isKnownRace('house', 'TX-0'), false)
  assert.equal(isKnownRace('house', 'DC-0'), false)
  assert.equal(isKnownRace('senate', 'ME'), true)
  // States without a 2026 race still open their officeholders.
  assert.equal(isKnownRace('senate', 'CA'), true)
  assert.equal(isKnownRace('governor', 'DC'), false)
  assert.equal(isKnownRace('governor', 'ZZ'), false)
  assert.equal(isKnownRace('senate', 'ME-2'), false)
})

test('a page-level Share keeps the referral and adds the current race', () => {
  assert.equal(
    shareSearch('?r=abc', '?office=senate&race=ME&utm_source=x'),
    '?r=abc&office=senate&race=ME'
  )
  assert.equal(shareSearch('?r=abc', ''), '?r=abc')
  assert.equal(shareSearch('', '?office=house'), '?office=house')
  assert.equal(shareSearch('', '?race=bogus'), '')
})

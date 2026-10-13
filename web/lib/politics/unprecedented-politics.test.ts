import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import {
  pickUnprecedentedPolitics,
  UNPRECEDENTED_POLITICS_SIZE,
  UNPRECEDENTED_POLITICS_SLUGS,
} from './unprecedented-politics'

const NOW = Date.UTC(2026, 9, 13)

const market = (slug: string, overrides: Record<string, unknown> = {}) =>
  ({
    id: `id-${slug}`,
    slug,
    question: slug,
    visibility: 'public',
    isResolved: false,
    closeTime: NOW + 1_000_000,
    ...overrides,
  } as unknown as Contract)

const slugsOf = (contracts: Contract[]) => contracts.map((c) => c.slug)

test('the curated list has no duplicates and keeps spares behind the slots', () => {
  assert.equal(
    new Set(UNPRECEDENTED_POLITICS_SLUGS).size,
    UNPRECEDENTED_POLITICS_SLUGS.length
  )
  assert.ok(UNPRECEDENTED_POLITICS_SLUGS.length > UNPRECEDENTED_POLITICS_SIZE)
})

test('the three markets the section was built around are in the shown slots', () => {
  const shown = UNPRECEDENTED_POLITICS_SLUGS.slice(
    0,
    UNPRECEDENTED_POLITICS_SIZE
  )
  for (const slug of [
    'will-there-be-pressure-by-troops-or',
    'will-trump-give-american-adults-500',
    'will-trump-declare-a-national-emerg-qphcUqSlZZ',
  ])
    assert.ok(shown.includes(slug), slug)
})

test('keeps the curated order, not the fetch order', () => {
  const fetched = [market('c'), market('a'), market('b')]
  assert.deepEqual(
    slugsOf(
      pickUnprecedentedPolitics(fetched, { now: NOW, slugs: ['a', 'b', 'c'] })
    ),
    ['a', 'b', 'c']
  )
})

test('drops closed, resolved, private, deleted and missing markets', () => {
  const fetched = [
    market('open'),
    market('closed', { closeTime: NOW - 1 }),
    market('resolved', { isResolved: true, resolution: 'YES' }),
    market('unlisted', { visibility: 'unlisted' }),
    market('deleted', { deleted: true }),
  ]
  const slugs = ['open', 'closed', 'resolved', 'unlisted', 'deleted', 'missing']
  assert.deepEqual(
    slugsOf(pickUnprecedentedPolitics(fetched, { now: NOW, slugs })),
    ['open']
  )
})

test('caps at the limit, and a spare slides in when an earlier market closes', () => {
  const slugs = ['a', 'b', 'c', 'd']
  const all = slugs.map((s) => market(s))
  assert.deepEqual(
    slugsOf(pickUnprecedentedPolitics(all, { now: NOW, slugs, limit: 3 })),
    ['a', 'b', 'c']
  )
  const bClosed = [
    market('a'),
    market('b', { closeTime: NOW - 1 }),
    market('c'),
    market('d'),
  ]
  assert.deepEqual(
    slugsOf(pickUnprecedentedPolitics(bClosed, { now: NOW, slugs, limit: 3 })),
    ['a', 'c', 'd']
  )
})

test('skips markets shown elsewhere on the page and never repeats one', () => {
  const fetched = [market('a'), market('b'), market('b'), market('c')]
  assert.deepEqual(
    slugsOf(
      pickUnprecedentedPolitics(fetched, {
        now: NOW,
        slugs: ['a', 'b', 'b', 'c'],
        excludeIds: ['id-a'],
      })
    ),
    ['b', 'c']
  )
})

test('with nothing fetched the section is simply hidden', () => {
  assert.deepEqual(pickUnprecedentedPolitics([], { now: NOW }), [])
})

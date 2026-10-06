import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import {
  buildMidtermConditionalRows,
  conditionalRowContracts,
  conditionalStem,
  MIDTERM_CONDITIONALS,
  MidtermConditionalEntry,
  midtermConditionalRefs,
} from './midterm-conditionals'

const NOW = Date.UTC(2026, 9, 6)

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

test('the curated list has no duplicate references', () => {
  const { slugs, ids } = midtermConditionalRefs()
  assert.ok(slugs.length + ids.length >= 3)
  assert.equal(new Set(slugs).size, slugs.length)
  assert.equal(new Set(ids).size, ids.length)
})

test('the card row keeps the two singles and the Senate pair', () => {
  // The House pairs moved to the 2026 House matrix (conditional-matrix.ts).
  assert.equal(MIDTERM_CONDITIONALS.length, 3)
  const pairs = MIDTERM_CONDITIONALS.flatMap((e) => ('pair' in e ? [e] : []))
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].pair.chamber, 'Senate')
  assert.deepEqual(midtermConditionalRefs().ids, ['pcdS8RNNRA', 'RU8Rztcs28'])
  assert.deepEqual(midtermConditionalRefs().slugs, [
    'if-democrats-win-the-house-or-senat',
    'if-trump-puts-boots-on-the-ground-i',
  ])
})

test('refs are split into slugs and ids', () => {
  const entries: MidtermConditionalEntry[] = [
    { market: { slug: 'a' } },
    {
      pair: {
        chamber: 'House',
        ifDemocrats: { id: 'D1' },
        ifRepublicans: { id: 'R1' },
      },
    },
  ]
  assert.deepEqual(midtermConditionalRefs(entries), {
    slugs: ['a'],
    ids: ['D1', 'R1'],
  })
})

test('singles keep list order and drop missing, closed or private markets', () => {
  const entries: MidtermConditionalEntry[] = [
    { market: { slug: 'a' } },
    { market: { slug: 'missing' } },
    { market: { slug: 'closed' } },
    { market: { slug: 'private' } },
    { market: { id: 'id-b' } },
  ]
  const rows = buildMidtermConditionalRows(
    [
      market('a'),
      market('closed', { closeTime: NOW - 1 }),
      market('private', { visibility: 'unlisted' }),
      market('b'),
    ],
    NOW,
    entries
  )
  assert.deepEqual(
    conditionalRowContracts(rows).map((c) => c.slug),
    ['a', 'b']
  )
  assert.ok(rows.every((r) => r.kind === 'single'))
})

test('a pair whose markets do not exist yet is skipped silently', () => {
  const rows = buildMidtermConditionalRows([], NOW, [
    {
      pair: {
        chamber: 'House',
        ifDemocrats: { id: 'notYet1' },
        ifRepublicans: { id: 'notYet2' },
      },
    },
  ])
  assert.deepEqual(rows, [])
})

test('a complete pair becomes one card with Dem left and the shared stem', () => {
  const dem = market('d', {
    id: 'pcdS8RNNRA',
    question:
      'If Democrats win the Senate in 2026, will a Supreme Court seat be filled in 2027?',
  })
  const rep = market('r', {
    id: 'RU8Rztcs28',
    question:
      'If Republicans keep the Senate in 2026, will a Supreme Court seat be filled in 2027?',
  })
  const rows = buildMidtermConditionalRows([rep, dem], NOW, [
    {
      pair: {
        chamber: 'Senate',
        ifDemocrats: { id: 'pcdS8RNNRA' },
        ifRepublicans: { id: 'RU8Rztcs28' },
      },
    },
  ])
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(row.kind, 'pair')
  if (row.kind !== 'pair') return
  assert.equal(row.ifDemocrats.id, 'pcdS8RNNRA')
  assert.equal(row.ifRepublicans.id, 'RU8Rztcs28')
  assert.equal(row.stem, 'Will a Supreme Court seat be filled in 2027?')
  assert.equal(row.demLabel, 'If Democrats win the Senate')
  assert.equal(row.repLabel, 'If Republicans keep the Senate')
})

test('a half pair degrades to a single card', () => {
  const rows = buildMidtermConditionalRows([market('r2', { id: 'R2' })], NOW, [
    {
      pair: {
        chamber: 'Senate',
        ifDemocrats: { id: 'D2' },
        ifRepublicans: { id: 'R2' },
      },
    },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'single')
})

test('conditionalStem falls back sensibly when questions differ', () => {
  assert.equal(
    conditionalStem(
      'If Democrats win the Senate, will a Supreme Court seat be filled in 2027?',
      'If Republicans keep the Senate, will a Supreme Court seat be filled in 2027?'
    ),
    'Will a Supreme Court seat be filled in 2027?'
  )
  // Nothing shared: the Democratic question after its condition.
  assert.equal(
    conditionalStem(
      'If Democrats win, will X happen?',
      'Totally different wording'
    ),
    'Will X happen?'
  )
  // No "If …," clause at all: the whole question.
  assert.equal(conditionalStem('Will Y?', 'Something else'), 'Will Y?')
})

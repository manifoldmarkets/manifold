import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import {
  BOTH_2026_MATRIX,
  buildConditionalMatrixRows,
  conditionalMatrixIds,
  ConditionalMatrixPair,
  congressChambers,
  gapPoints,
  HOUSE_2026_COLUMNS,
  HOUSE_2026_MATRIX,
  isMatrixCollapsible,
  MATRIX_COLLAPSED_ROWS,
  matrixProb,
  matrixRowContracts,
  PRESIDENT_2028_MATRIX,
  SENATE_2026_MATRIX,
  slimMatrixRows,
  visibleMatrixRows,
  wholePercent,
  withConditionProbs,
} from './conditional-matrix'

const NOW = Date.UTC(2026, 9, 7)

const binary = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    slug: `slug-${id}`,
    question: `Question ${id}?`,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    visibility: 'public',
    isResolved: false,
    closeTime: NOW + 1_000_000,
    prob: 0.4,
    p: 0.5,
    pool: { YES: 60, NO: 40 },
    description: 'long resolution criteria',
    ...overrides,
  } as unknown as Contract)

const PAIRS: ConditionalMatrixPair[] = [
  { label: 'First', dem: 'D1', rep: 'R1' },
  { label: 'Second', dem: 'D2', rep: 'R2' },
  { label: 'Third', dem: 'D3', rep: 'R3' },
]

const all = (pairs = PAIRS) =>
  pairs.flatMap((p) =>
    [p.dem, p.rep].filter((id): id is string => !!id).map((id) => binary(id))
  )

test('a complete pair becomes a row, in config order, Dem and Rep kept apart', () => {
  // Fetched order is irrelevant: rows follow the config.
  const rows = buildConditionalMatrixRows(PAIRS, all().reverse(), NOW)
  assert.deepEqual(
    rows.map((r) => [r.label, r.dem?.id, r.rep?.id]),
    [
      ['First', 'D1', 'R1'],
      ['Second', 'D2', 'R2'],
      ['Third', 'D3', 'R3'],
    ]
  )
})

test('a one-sided config needs only its one market, and never gets an undefined key', () => {
  const pairs: ConditionalMatrixPair[] = [
    { label: 'Pair', dem: 'D1', rep: 'R1' },
    { label: 'Rep only', rep: 'R2' },
    { label: 'Dem only', dem: 'D3' },
    { label: 'Rep only, missing', rep: 'R4' },
    { label: 'Neither' },
  ]
  const rows = buildConditionalMatrixRows(pairs, all(), NOW)
  assert.deepEqual(
    rows.map((r) => [r.label, r.dem?.id, r.rep?.id]),
    [
      ['Pair', 'D1', 'R1'],
      ['Rep only', undefined, 'R2'],
      ['Dem only', 'D3', undefined],
    ]
  )
  // Absent, not undefined: Next.js cannot serialize undefined page props.
  assert.deepEqual(Object.keys(rows[1]), ['label', 'rep'])
  assert.deepEqual(Object.keys(rows[2]), ['label', 'dem'])
  assert.deepEqual(Object.keys(slimMatrixRows(rows)[1]), ['label', 'rep'])
  assert.deepEqual(
    matrixRowContracts(rows).map((c) => c.id),
    ['D1', 'R1', 'R2', 'D3']
  )
})

test('a row with a missing side is dropped', () => {
  const fetched = all().filter((c) => c.id !== 'R2')
  const rows = buildConditionalMatrixRows(PAIRS, fetched, NOW)
  assert.deepEqual(
    rows.map((r) => r.label),
    ['First', 'Third']
  )
})

test('a row with a closed, resolved, private, deleted or non-binary side is dropped', () => {
  const bad: Record<string, Record<string, unknown>> = {
    closed: { closeTime: NOW - 1 },
    resolved: { isResolved: true, resolution: 'YES' },
    unlisted: { visibility: 'unlisted' },
    deleted: { deleted: true },
    multi: { mechanism: 'cpmm-multi-1', outcomeType: 'MULTIPLE_CHOICE' },
  }
  for (const [why, overrides] of Object.entries(bad)) {
    const fetched = all().map((c) =>
      c.id === 'D1' ? binary('D1', overrides) : c
    )
    const rows = buildConditionalMatrixRows(PAIRS, fetched, NOW)
    assert.deepEqual(
      rows.map((r) => r.label),
      ['Second', 'Third'],
      why
    )
  }
})

test('a matrix with fewer than two complete rows is hidden', () => {
  // Nothing created yet.
  assert.deepEqual(buildConditionalMatrixRows(PAIRS, [], NOW), [])
  // One complete row and two halves.
  const fetched = all().filter((c) => !['R2', 'D3'].includes(c.id))
  assert.deepEqual(buildConditionalMatrixRows(PAIRS, fetched, NOW), [])
  // Two complete rows is enough.
  const two = all().filter((c) => c.id !== 'D3')
  assert.equal(buildConditionalMatrixRows(PAIRS, two, NOW).length, 2)
})

test('the real config resolves to nothing before its markets exist', () => {
  assert.deepEqual(buildConditionalMatrixRows(SENATE_2026_MATRIX, [], NOW), [])
  assert.deepEqual(buildConditionalMatrixRows(HOUSE_2026_MATRIX, [], NOW), [])
  assert.deepEqual(
    buildConditionalMatrixRows(PRESIDENT_2028_MATRIX, [], NOW),
    []
  )
})

test('config ids are unique across all matrices', () => {
  const ids = conditionalMatrixIds()
  // Senate 6 pairs, House 10, 2028 7, Both: one pair and one Rep-only row.
  assert.equal(ids.length, 2 * (6 + 10 + 7) + 3)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[A-Za-z0-9]{10}$/)
  // Labels repeat across matrices (a 2027 shutdown is asked under both
  // chambers) but not within one.
  for (const matrix of [
    SENATE_2026_MATRIX,
    HOUSE_2026_MATRIX,
    BOTH_2026_MATRIX,
    PRESIDENT_2028_MATRIX,
  ]) {
    const labels = matrix.map((p) => p.label)
    assert.equal(new Set(labels).size, labels.length)
  }
})

test('the House pairs that moved into the matrix are where they should be', () => {
  const house = HOUSE_2026_MATRIX.map((p) => [p.dem, p.rep])
  for (const pair of [
    ['QSAIq5EEps', 'POZNNqR528'],
    ['2RZ2c5ZICl', '8RI2Qy9ndh'],
    ['C9pqA8yg00', 'usOOuPqSst'],
  ])
    assert.ok(house.some((p) => p[0] === pair[0] && p[1] === pair[1]))
})

test('the Supreme Court pair moved from the card row to the Senate matrix', () => {
  assert.ok(
    SENATE_2026_MATRIX.some(
      (p) => p.dem === 'pcdS8RNNRA' && p.rep === 'RU8Rztcs28'
    )
  )
})

test('the Both view holds the sweep markets, with the $5,000 checks Rep-only', () => {
  const checks = BOTH_2026_MATRIX.find((p) => p.rep === 'Ud2Q60puts')
  assert.ok(checks)
  assert.equal(checks?.dem, undefined)
  const depression = BOTH_2026_MATRIX.find((p) => p.dem === 'NLtqAPnLzA')
  assert.equal(depression?.rep, 'tPgqUCc2zq')
  for (const p of BOTH_2026_MATRIX) assert.ok(p.dem || p.rep, p.label)
})

test('the Congress section offers the views that have rows, Senate first, Both last', () => {
  const rows = buildConditionalMatrixRows(PAIRS, all(), NOW)
  assert.deepEqual(
    congressChambers({ senate: rows, house: rows, both: rows }),
    ['senate', 'house', 'both']
  )
  assert.deepEqual(congressChambers({ senate: [], house: rows, both: [] }), [
    'house',
  ])
  assert.deepEqual(congressChambers({ senate: rows, house: [], both: [] }), [
    'senate',
  ])
  assert.deepEqual(congressChambers({ senate: [], house: [], both: rows }), [
    'both',
  ])
  assert.deepEqual(congressChambers({ senate: [], house: [], both: [] }), [])
})

test('slimMatrixRows drops the description but keeps what the matrix reads', () => {
  const rows = buildConditionalMatrixRows(PAIRS, all(), NOW)
  const slim = slimMatrixRows(rows)
  const [full, thin] = [rows[0].dem, slim[0].dem]
  assert.ok(full && thin)
  if (!full || !thin) return
  assert.equal('description' in thin, false)
  assert.equal(thin.question, full.question)
  assert.equal(matrixProb(thin), matrixProb(full))
})

test('long matrices collapse to six rows behind a toggle', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i)
  assert.equal(isMatrixCollapsible(8), false)
  assert.equal(visibleMatrixRows(rows(8), false).length, 8)
  assert.equal(isMatrixCollapsible(9), true)
  assert.equal(visibleMatrixRows(rows(10), false).length, MATRIX_COLLAPSED_ROWS)
  assert.equal(visibleMatrixRows(rows(10), true).length, 10)
})

test('wholePercent rounds, and keeps the tails off 0% and 100%', () => {
  assert.equal(wholePercent(0.344), '34%')
  assert.equal(wholePercent(0.346), '35%')
  assert.equal(wholePercent(0), '0%')
  assert.equal(wholePercent(1), '100%')
  assert.equal(wholePercent(0.003), '<1%')
  assert.equal(wholePercent(0.997), '>99%')
  assert.equal(wholePercent(undefined), '–')
  assert.equal(wholePercent(NaN), '–')
})

test('gapPoints is the gap between the displayed percents', () => {
  assert.equal(gapPoints(0.344, 0.12), 22)
  assert.equal(gapPoints(0.12, 0.344), 22)
  assert.equal(gapPoints(0.5, 0.5), 0)
})

test('withConditionProbs adds each column its own party’s chance', () => {
  const [dem, rep] = withConditionProbs(HOUSE_2026_COLUMNS, {
    dem: 0.21,
    rep: 0.79,
  })
  assert.equal(dem.prob, 0.21)
  assert.equal(rep.prob, 0.79)
  const [noDem, noRep] = withConditionProbs(HOUSE_2026_COLUMNS, undefined)
  assert.equal(noDem.prob, undefined)
  assert.equal(noRep.prob, undefined)
  const [nanDem] = withConditionProbs(HOUSE_2026_COLUMNS, {
    dem: NaN,
    rep: 0.5,
  })
  assert.equal(nanDem.prob, undefined)
})

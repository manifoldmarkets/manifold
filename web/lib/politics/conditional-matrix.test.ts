import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import {
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
  PRESIDENT_2028_MATRIX,
  SENATE_2026_MATRIX,
  slimMatrixRows,
  visibleMatrixRows,
  wholePercent,
  withConditionProbs,
} from './conditional-matrix'
import {
  MIDTERM_CONDITIONALS,
  midtermConditionalRefs,
} from './midterm-conditionals'

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
  pairs.flatMap((p) => [binary(p.dem), binary(p.rep)])

test('a complete pair becomes a row, in config order, Dem and Rep kept apart', () => {
  // Fetched order is irrelevant: rows follow the config.
  const rows = buildConditionalMatrixRows(PAIRS, all().reverse(), NOW)
  assert.deepEqual(
    rows.map((r) => [r.label, r.dem.id, r.rep.id]),
    [
      ['First', 'D1', 'R1'],
      ['Second', 'D2', 'R2'],
      ['Third', 'D3', 'R3'],
    ]
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
  assert.equal(ids.length, 2 * (6 + 10 + 7))
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[A-Za-z0-9]{10}$/)
  // Labels repeat across matrices (a 2027 shutdown is asked under both
  // chambers) but not within one.
  for (const matrix of [
    SENATE_2026_MATRIX,
    HOUSE_2026_MATRIX,
    PRESIDENT_2028_MATRIX,
  ]) {
    const labels = matrix.map((p) => p.label)
    assert.equal(new Set(labels).size, labels.length)
  }
})

test('no market is in both a matrix and the conditional card row', () => {
  const matrixIds = new Set(conditionalMatrixIds())
  const { ids } = midtermConditionalRefs(MIDTERM_CONDITIONALS)
  assert.deepEqual(
    ids.filter((id) => matrixIds.has(id)),
    []
  )
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

test('the Congress section offers the chambers that have rows, Senate first', () => {
  const rows = buildConditionalMatrixRows(PAIRS, all(), NOW)
  assert.deepEqual(congressChambers({ senate: rows, house: rows }), [
    'senate',
    'house',
  ])
  assert.deepEqual(congressChambers({ senate: [], house: rows }), ['house'])
  assert.deepEqual(congressChambers({ senate: rows, house: [] }), ['senate'])
  assert.deepEqual(congressChambers({ senate: [], house: [] }), [])
})

test('slimMatrixRows drops the description but keeps what the matrix reads', () => {
  const rows = buildConditionalMatrixRows(PAIRS, all(), NOW)
  const slim = slimMatrixRows(rows)
  assert.equal('description' in slim[0].dem, false)
  assert.equal(slim[0].dem.question, rows[0].dem.question)
  assert.equal(matrixProb(slim[0].dem), matrixProb(rows[0].dem))
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

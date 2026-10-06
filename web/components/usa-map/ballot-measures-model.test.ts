import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import {
  approvalChance,
  BALLOT_MEASURES,
  BallotMeasure,
  matchesMeasureQuery,
  sideProbability,
  stateMeasureStatus,
  tradeFor,
} from './ballot-measures-model'

const binary = (id: string, p: number, resolution?: string) =>
  ({
    id,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    pool: { YES: 1 - p, NO: p },
    p: 0.5,
    resolution,
  } as unknown as Contract)

const portfolio = (
  id: string,
  answers: { id: string; p: number; resolution?: string }[]
) =>
  ({
    id,
    mechanism: 'cpmm-multi-1',
    shouldAnswersSumToOne: false,
    answers: answers.map((a) => ({
      id: a.id,
      text: a.id,
      poolYes: 1 - a.p,
      poolNo: a.p,
      resolution: a.resolution,
    })),
  } as unknown as Contract)

const base: Omit<BallotMeasure, 'source'> = {
  key: 'CA-prop-50',
  state: 'CA',
  designation: 'Proposition 50',
  title: 'Test Act',
  shortSummary: 'congressional redistricting',
  topic: 'redistricting',
  officialSourceUrl: 'https://voterguide.sos.ca.gov/',
  approvalRule: 'Simple majority',
}

test('a YES = approve binary prices approval and trades YES for Pass', () => {
  const m: BallotMeasure = {
    ...base,
    source: {
      kind: 'binary',
      contractId: 'b1',
      slug: 's',
      yesOrientation: 'approve',
      confidence: 'confirmed',
    },
  }
  const c = approvalChance(m, binary('b1', 0.7))!
  assert.ok(Math.abs(c - 0.7) < 1e-9)
  assert.deepEqual(tradeFor(m, 'pass'), { contractId: 'b1', outcome: 'YES' })
  assert.deepEqual(tradeFor(m, 'fail'), { contractId: 'b1', outcome: 'NO' })
  assert.ok(
    Math.abs(sideProbability(c, 'pass') + sideProbability(c, 'fail') - 1) <
      1e-12
  )
})

test('a reverse-worded binary flips both the chance and the traded outcome', () => {
  const m: BallotMeasure = {
    ...base,
    source: {
      kind: 'binary',
      contractId: 'b2',
      slug: 's',
      yesOrientation: 'reject',
      confidence: 'conditional',
    },
  }
  const c = approvalChance(m, binary('b2', 0.7))!
  assert.ok(Math.abs(c - 0.3) < 1e-9)
  assert.deepEqual(tradeFor(m, 'pass'), { contractId: 'b2', outcome: 'NO' })
  assert.deepEqual(tradeFor(m, 'fail'), { contractId: 'b2', outcome: 'YES' })
})

test('a portfolio answer is priced on its own and traded with its answer ID', () => {
  const m: BallotMeasure = {
    ...base,
    source: {
      kind: 'portfolio-answer',
      contractId: 'p1',
      slug: 's',
      answerId: 'a2',
      yesOrientation: 'approve',
      confidence: 'conditional',
    },
  }
  const c = portfolio('p1', [
    { id: 'a1', p: 0.9 },
    { id: 'a2', p: 0.8 },
    { id: 'a3', p: 0.7 },
  ])
  // Independent answers: 0.8 stays 0.8 even though the answers sum to 2.4.
  assert.ok(Math.abs(approvalChance(m, c)! - 0.8) < 1e-9)
  assert.deepEqual(tradeFor(m, 'fail'), {
    contractId: 'p1',
    outcome: 'NO',
    answerId: 'a2',
  })
})

test('cancelled, mismatched or sum-to-one sources are unpriced, never guessed', () => {
  const m: BallotMeasure = {
    ...base,
    source: {
      kind: 'portfolio-answer',
      contractId: 'p1',
      slug: 's',
      answerId: 'a2',
      yesOrientation: 'approve',
      confidence: 'conditional',
    },
  }
  assert.equal(
    approvalChance(
      m,
      portfolio('p1', [{ id: 'a2', p: 0.8, resolution: 'CANCEL' }])
    ),
    undefined
  )
  assert.equal(
    approvalChance(m, portfolio('other', [{ id: 'a2', p: 0.8 }])),
    undefined
  )
  const sumToOne = {
    ...portfolio('p1', [{ id: 'a2', p: 0.8 }]),
    shouldAnswersSumToOne: true,
  } as Contract
  assert.equal(approvalChance(m, sumToOne), undefined)
  const b: BallotMeasure = {
    ...base,
    source: {
      kind: 'binary',
      contractId: 'b1',
      slug: 's',
      yesOrientation: 'approve',
      confidence: 'confirmed',
    },
  }
  assert.equal(approvalChance(b, binary('b1', 0.6, 'CANCEL')), undefined)
  assert.equal(approvalChance({ ...base }, binary('b1', 0.6)), undefined)
})

test('states without measures stay distinct from measures without markets', () => {
  const ms: BallotMeasure[] = [
    {
      ...base,
      source: {
        kind: 'binary',
        contractId: 'b1',
        slug: 's',
        yesOrientation: 'approve',
        confidence: 'confirmed',
      },
    },
    { ...base, key: 'CA-prop-51', designation: 'Proposition 51' },
  ]
  const s = stateMeasureStatus(['CA', 'TX'], ms)
  assert.deepEqual(s.CA, { kind: 'measures', total: 2, linked: 1, unlinked: 1 })
  assert.deepEqual(s.TX, { kind: 'no-measures' })
})

test('search matches state, designation forms and topic without cross-state number collisions', () => {
  const m: BallotMeasure = { ...base }
  for (const q of [
    'CA',
    'california',
    'prop 50',
    'Prop50',
    'proposition 50',
    'CA Prop 50',
    '50',
    'redistricting',
  ])
    assert.ok(matchesMeasureQuery(m, q, 'California'), q)
  for (const q of ['NV Prop 50', 'prop 5', 'question 50', 'abortion'])
    assert.ok(!matchesMeasureQuery(m, q, 'California'), q)
})

test('the integrated inventory excludes disputed propositions from approval trading', () => {
  assert.equal(BALLOT_MEASURES.length, 145)
  assert.equal(new Set(BALLOT_MEASURES.map((m) => m.key)).size, 145)
  for (const key of ['CA-prop-43', 'MA-q-9', 'ID-state-gun']) {
    const m = BALLOT_MEASURES.find((m) => m.key === key)!
    assert.equal(tradeFor(m, 'pass'), undefined, key)
    assert.ok(m.marketNote, key)
  }
  assert.equal(BALLOT_MEASURES.filter((m) => m.source).length, 20)
  for (const m of BALLOT_MEASURES.filter(
    (m) => m.source?.confidence === 'conditional'
  ))
    assert.ok(m.source?.criteriaNote, m.key)
})

test('real portfolio mappings select distinct answers with complementary prices', () => {
  const measures = BALLOT_MEASURES.filter(
    (m) => m.source?.kind === 'portfolio-answer'
  )
  for (const m of measures) {
    const source = m.source!
    assert.equal(source.kind, 'portfolio-answer')
    if (source.kind !== 'portfolio-answer') continue
    const c = portfolio(source.contractId, [
      { id: source.answerId, p: 0.73 },
      { id: 'unrelated', p: 0.92 },
    ])
    assert.ok(Math.abs(approvalChance(m, c)! - 0.73) < 1e-9)
    assert.deepEqual(tradeFor(m, 'fail'), {
      contractId: c.id,
      answerId: source.answerId,
      outcome: 'NO',
    })
  }
})

test('search combines full state names, measure numbers and topics', () => {
  const ca = BALLOT_MEASURES.find((m) => m.key === 'CA-prop-39')!
  const nv = BALLOT_MEASURES.find((m) => m.key === 'NV-q-6')!
  assert.ok(matchesMeasureQuery(ca, 'California Prop 39', 'California'))
  assert.ok(matchesMeasureQuery(ca, 'CA voter', 'California'))
  assert.ok(matchesMeasureQuery(nv, 'Nevada Q6', 'Nevada'))
  assert.ok(!matchesMeasureQuery(ca, 'NV prop 39', 'California'))
})

// node:test suite for the race board's frozen and week-ago odds. From web/:
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
//     node --no-experimental-strip-types -r ts-node/register/transpile-only \
//     -r tsconfig-paths/register --test lib/politics/board-odds.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import { getAnswerProbability } from 'common/calculate'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { Contract, isMultiCpmm } from 'common/contract'
import {
  MarketProbsHistory,
  PROBS_HISTORY_MAX_FRAMES,
  PROBS_HISTORY_MAX_WINDOW_MS,
  PROBS_HISTORY_MIN_STEP_MS,
} from 'common/market-probs-history'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import mapping from 'web/public/data/election-markets-2028.json'
import {
  boardMarketIds,
  fetchFrozenProbs,
  FREEZE_BATCH,
  freezeHistoryGone,
  freezeStep,
  historyServes,
  probsAtFreeze,
  twoPartyAtFreeze,
  twoPartyShare,
  twoPartyWeekAgo,
} from './board-odds'
import { BOARD_FREEZE, STATE_MARKETS_2028 } from './elections-2028-config'
import type { OfficialMarketsFile } from './official-markets'

const AT = BOARD_FREEZE[2028]

// getPartyProbs' reading, for fixtures: answers by party name; a binary
// market's YES is the Republican.
const party = (c: Contract) => {
  if (isMultiCpmm(c)) {
    const sum = (re: RegExp) =>
      c.answers
        .filter((a) => re.test(a.text))
        .reduce((s, a) => s + getAnswerProbability(c, a.id), 0)
    return { dem: sum(/Democrat/), rep: sum(/Republican/) }
  }
  if (c.mechanism === 'cpmm-1') {
    const rep = getCpmmProbability(c.pool, c.p)
    return { dem: 1 - rep, rep }
  }
  return undefined
}

// With p = 0.5 an answer's probability is poolNo / (poolYes + poolNo).
const answer = (
  id: string,
  text: string,
  prob: number,
  extra: Record<string, unknown> = {}
) => ({
  id,
  text,
  contractId: 'mc',
  poolYes: 100 * (1 - prob),
  poolNo: 100 * prob,
  p: 0.5,
  prob,
  createdTime: AT - 30 * DAY_MS,
  probChanges: { day: 0, week: 0, month: 0 },
  ...extra,
})

const multi = (answers: ReturnType<typeof answer>[]) =>
  ({
    id: 'mc',
    slug: 'mc',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    createdTime: AT - 60 * DAY_MS,
    answers,
  } as unknown as Contract)

// A binary market at `rep` (YES = Republican), p = 0.5.
const binary = (rep: number, week = 0) =>
  ({
    id: 'bin',
    slug: 'bin',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    createdTime: AT - 60 * DAY_MS,
    pool: { YES: 100 * (1 - rep), NO: 100 * rep },
    p: 0.5,
    prob: rep,
    probChanges: { day: 0, week, month: 0 },
  } as unknown as Contract)

const close = (a: number | undefined, b: number) =>
  assert.ok(a !== undefined && Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('the freeze step divides the freeze and keeps 72 hours under the frame cap', () => {
  for (const at of Object.values(BOARD_FREEZE)) {
    const step = freezeStep(at)
    assert.ok(step !== undefined)
    assert.equal(at % step, 0)
    assert.ok(step >= PROBS_HISTORY_MIN_STEP_MS && step <= DAY_MS)
    assert.ok(
      Math.floor(PROBS_HISTORY_MAX_WINDOW_MS / step) + 1 <=
        PROBS_HISTORY_MAX_FRAMES
    )
    // The largest such step: the fewest frames.
    for (
      let s = step + PROBS_HISTORY_MIN_STEP_MS;
      s <= DAY_MS;
      s += 5 * MINUTE_MS
    )
      assert.notEqual(at % s, 0)
  }
  assert.equal(freezeStep(Date.UTC(2028, 10, 7)), DAY_MS)
  assert.equal(freezeStep(AT + 1), undefined)
})

test('market-probs-history serves the freeze for 72 hours, with margins', () => {
  const step = freezeStep(AT)!
  assert.equal(historyServes(AT, AT - HOUR_MS, step), false)
  assert.equal(historyServes(AT, AT + 30_000, step), false)
  assert.equal(historyServes(AT, AT + 2 * MINUTE_MS, step), true)
  assert.equal(historyServes(AT, AT + 71 * HOUR_MS, step), true)
  assert.equal(historyServes(AT, AT + 72 * HOUR_MS, step), false)
  assert.equal(historyServes(AT, AT + 30 * DAY_MS, step), false)
})

test('probsAtFreeze reads each series at the first frame', () => {
  const history: MarketProbsHistory = {
    times: [AT, AT + HOUR_MS, AT + 2 * HOUR_MS, AT + 3 * HOUR_MS],
    markets: {
      bin: {
        prob: [
          [0, 0.4],
          [3, 0.9],
        ],
      },
      mc: {
        answerProbs: {
          d: [
            [0, 0.6],
            [2, 0.99],
          ],
          r: [[0, 0.3]],
          late: [[1, 0.1]], // added after the freeze
        },
      },
      newer: { prob: [[2, 0.5]] }, // created after the freeze
    },
  }
  assert.deepEqual(probsAtFreeze(history, AT), {
    bin: { prob: 0.4 },
    mc: { answerProbs: { d: 0.6, r: 0.3 } },
  })
  // A history that doesn't start at the freeze says nothing about it.
  assert.deepEqual(probsAtFreeze(history, AT - HOUR_MS), {})
})

test('fetchFrozenProbs: one bounded request per 100 markets; failures leave markets out', async () => {
  const ids = Array.from({ length: 250 }, (_, i) => `m${1000 + i}`).reverse()
  const step = freezeStep(AT)!
  const calls: string[][] = []
  let inFlight = 0
  let maxInFlight = 0
  const logged: string[] = []
  const probs = await fetchFrozenProbs(
    ids,
    AT,
    step,
    async (batch, start, s) => {
      calls.push(batch)
      assert.equal(start, AT)
      assert.equal(s, step)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        if (batch.includes('m1100')) throw new Error('503')
        if (batch.includes('m1200')) await new Promise(() => undefined) // hangs
        await new Promise((r) => setTimeout(r, 5))
        return {
          times: [AT, AT + step],
          markets: Object.fromEntries(
            batch.map((id) => [id, { prob: [[0, 0.25]] }])
          ),
        } as MarketProbsHistory
      } finally {
        inFlight--
      }
    },
    { concurrency: 2, timeoutMs: 50, log: (m) => logged.push(m) }
  )
  assert.equal(calls.length, Math.ceil(250 / FREEZE_BATCH))
  assert.ok(calls.every((b) => b.length <= FREEZE_BATCH))
  assert.deepEqual(calls[0].slice(0, 2), ['m1000', 'm1001']) // sorted
  assert.ok(maxInFlight <= 2)
  // Batch 1 (m1000-m1099) answered; batch 2 failed, batch 3 timed out.
  assert.equal(Object.keys(probs).length, 100)
  assert.deepEqual(probs.m1050, { prob: 0.25 })
  assert.equal(probs.m1150, undefined)
  assert.equal(logged.length, 2)
})

test('a multiple choice market freezes at its two-party share then', () => {
  const c = multi([
    answer('d', 'Democratic Party', 0.97, {
      resolution: 'YES',
      resolutionTime: AT + DAY_MS,
    }),
    answer('r', 'Republican Party', 0.02),
    answer('o', 'Other', 0.01),
    answer('late', 'Democratic write-in', 0.5, { createdTime: AT + HOUR_MS }),
  ])
  const frozen = { answerProbs: { d: 0.6, r: 0.3, o: 0.1 } }
  // Resolved since (and an answer added since): neither counts at the freeze.
  close(twoPartyAtFreeze(c, AT, frozen, party), 0.6 / 0.9)
  assert.equal(twoPartyAtFreeze(c, AT, undefined, party), undefined)
  assert.equal(twoPartyAtFreeze(c, AT, { answerProbs: {} }, party), undefined)
  // Created after the freeze: no frozen share.
  const newer = { ...c, createdTime: AT + HOUR_MS } as Contract
  assert.equal(twoPartyAtFreeze(newer, AT, frozen, party), undefined)
})

test('a binary market freezes too', () => {
  const c = binary(0.9)
  close(twoPartyAtFreeze(c, AT, { prob: 0.25 }, party), 0.75)
  close(twoPartyShare(c, party), 0.1)
})

test('the weekly move is in two-party terms', () => {
  const c = multi([
    answer('d', 'Democratic Party', 0.6, {
      probChanges: { day: 0, week: 0.1, month: 0 },
    }),
    answer('r', 'Republican Party', 0.35, {
      probChanges: { day: 0, week: -0.1, month: 0 },
    }),
    answer('o', 'Other', 0.05),
  ])
  close(twoPartyShare(c, party), 0.6 / 0.95)
  close(twoPartyWeekAgo(c, AT, party), 0.5 / 0.95)
  close(twoPartyWeekAgo(binary(0.3, 0.05), AT, party), 0.75)
  assert.equal(
    twoPartyWeekAgo(
      multi([answer('d', 'Democratic Party', 0.5, { probChanges: {} })]),
      AT,
      party
    ),
    undefined
  )
})

test('the board snapshot covers official race markets and the community units', () => {
  const markets = (mapping as unknown as OfficialMarketsFile).markets
  const ids2028 = boardMarketIds(2028, markets, STATE_MARKETS_2028)
  for (const id of Object.values(STATE_MARKETS_2028))
    assert.ok(ids2028.includes(id))
  const kinds = new Set(
    Object.values(markets)
      .filter((r) => ids2028.includes(r.id))
      .map((r) => r.kind)
  )
  assert.deepEqual([...kinds].sort(), [
    'governor',
    'house',
    'president-unit',
    'senate',
  ])
  const ids2030 = boardMarketIds(2030, markets, STATE_MARKETS_2028)
  assert.ok(ids2030.every((id) => markets[id] === undefined))
  assert.ok(
    ids2030.every((id) =>
      Object.values(markets).some((r) => r.id === id && r.cycle === 2030)
    )
  )
})

test('the freeze history is gone after 72 hours, or with an unusable freeze time', () => {
  assert.equal(freezeHistoryGone(AT, AT - HOUR_MS), false)
  assert.equal(freezeHistoryGone(AT, AT + 30_000), false)
  assert.equal(freezeHistoryGone(AT, AT + 71 * HOUR_MS), false)
  assert.equal(freezeHistoryGone(AT, AT + 72 * HOUR_MS), true)
  assert.equal(freezeHistoryGone(AT, AT + 365 * DAY_MS), true)
  assert.equal(freezeHistoryGone(AT + 1, AT + HOUR_MS), true)
})

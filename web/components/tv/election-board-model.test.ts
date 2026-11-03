import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract, CPMMMultiContract } from 'common/contract'
import {
  biggestMovers,
  BoardRace,
  boardTrades,
  closestRaces,
  latestCalls,
  pricedADayAgo,
  raceMove,
  TradeTarget,
} from './election-board-model'

const binary = (
  prob: number,
  day: number,
  extra: Partial<BinaryContract> = {}
) =>
  ({
    id: 'b1',
    slug: 'binary-race',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    // A pool priced at `prob` with p = 0.5.
    pool: { YES: 1 - prob, NO: prob },
    p: 0.5,
    prob,
    probChanges: { day, week: 0, month: 0 },
    isResolved: false,
    ...extra,
  } as unknown as BinaryContract)

const answer = (
  id: string,
  prob: number,
  day: number,
  extra: Partial<Answer> = {}
) =>
  ({
    id,
    text: id,
    poolYes: 1 - prob,
    poolNo: prob,
    p: 0.5,
    prob,
    probChanges: { day, week: 0, month: 0 },
    ...extra,
  } as unknown as Answer)

const multi = (answers: Answer[]) =>
  ({
    id: 'm1',
    slug: 'multi-race',
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    isResolved: false,
    answers,
  } as unknown as CPMMMultiContract)

const race = (
  key: string,
  odds: BoardRace['odds'],
  contract: Contract = binary(0.5, 0)
): BoardRace => ({
  id: key,
  key: `senate:${key}`,
  mode: 'senate',
  state: key,
  label: `${key} Senate`,
  shortLabel: key,
  contract,
  odds,
})

test('pricedADayAgo pins a binary at its price a day ago', () => {
  const c = binary(0.6, 0.15)
  assert.ok(Math.abs(getDisplayProbability(c) - 0.6) < 1e-9)
  const before = pricedADayAgo(c) as BinaryContract
  assert.ok(Math.abs(getDisplayProbability(before) - 0.45) < 1e-9)
  // The live contract is untouched.
  assert.equal(c.resolutionProbability, undefined)
})

test('pricedADayAgo clamps, skips missing changes and keeps settled prices', () => {
  assert.equal(
    getDisplayProbability(pricedADayAgo(binary(0.1, 0.3)) as BinaryContract),
    0
  )
  const noChange = binary(0.7, NaN)
  assert.ok(
    Math.abs(
      getDisplayProbability(pricedADayAgo(noChange) as BinaryContract) - 0.7
    ) < 1e-9
  )
  const settled = binary(1, 0.4, { isResolved: true, resolution: 'YES' })
  assert.equal(pricedADayAgo(settled), settled)
})

test('pricedADayAgo pins each open answer and leaves resolved ones', () => {
  const c = multi([
    answer('Democratic Party', 0.55, 0.1),
    answer('Republican Party', 0.45, -0.1),
    answer('Gone', 0, 0, { resolution: 'NO' }),
  ])
  const before = pricedADayAgo(c) as CPMMMultiContract
  assert.ok(
    Math.abs(getAnswerProbability(before, 'Democratic Party') - 0.45) < 1e-9
  )
  assert.ok(
    Math.abs(getAnswerProbability(before, 'Republican Party') - 0.55) < 1e-9
  )
  assert.equal(getAnswerProbability(before, 'Gone'), 0)
  assert.equal(before.answers[2].resolution, 'NO')
  // Still live on the original.
  assert.equal(c.answers[0].resolution, undefined)
})

test('raceMove names the biggest gainer and flags a flipped leader', () => {
  const now = race('PA', { dem: 0.4, rep: 0.6, other: 0 })
  const move = raceMove(now, race('PA', { dem: 0.55, rep: 0.45, other: 0 }))
  assert.equal(move?.gainer, 'rep')
  assert.ok(Math.abs((move?.gain ?? 0) - 0.15) < 1e-9)
  assert.equal(move?.flipped, true)

  const steady = raceMove(now, race('PA', { dem: 0.3, rep: 0.7, other: 0 }))
  assert.equal(steady?.gainer, 'dem')
  assert.equal(steady?.flipped, false)

  assert.equal(raceMove(now, undefined), undefined)
  assert.equal(raceMove(race('PA', undefined), now), undefined)
})

test('biggestMovers drops small moves and settled races, biggest first', () => {
  const now = [
    race('PA', { dem: 0.4, rep: 0.6, other: 0 }),
    race('OH', { dem: 0.3, rep: 0.7, other: 0 }),
    race('GA', { dem: 0.505, rep: 0.495, other: 0 }),
    race(
      'ME',
      { dem: 0.2, rep: 0.8, other: 0 },
      binary(1, 0.3, { isResolved: true, resolution: 'YES' })
    ),
  ]
  const then = [
    race('PA', { dem: 0.5, rep: 0.5, other: 0 }),
    race('OH', { dem: 0.5, rep: 0.5, other: 0 }),
    race('GA', { dem: 0.5, rep: 0.5, other: 0 }),
    race('ME', { dem: 0.5, rep: 0.5, other: 0 }),
  ]
  assert.deepEqual(
    biggestMovers(now, then).map((m) => m.race.id),
    ['OH', 'PA']
  )
})

test('closestRaces sorts by distance from even and skips unpriced and settled', () => {
  const races = [
    race('A', { dem: 0.2, rep: 0.8, other: 0 }),
    race('B', { dem: 0.48, rep: 0.52, other: 0 }),
    race('C', undefined),
    race('D', { dem: 0.5, rep: 0.5, other: 0 }),
    race(
      'E',
      { dem: 0.5, rep: 0.5, other: 0 },
      binary(1, 0, { isResolved: true, resolution: 'YES' })
    ),
  ]
  assert.deepEqual(
    closestRaces(races).map((r) => r.id),
    ['D', 'B', 'A']
  )
})

test('latestCalls lists settled races newest first, ignoring cancellations', () => {
  const races = [
    race(
      'A',
      { dem: 0, rep: 1, other: 0 },
      binary(1, 0, { isResolved: true, resolution: 'YES', resolutionTime: 100 })
    ),
    race(
      'B',
      { dem: 1, rep: 0, other: 0 },
      binary(0, 0, { isResolved: true, resolution: 'NO', resolutionTime: 300 })
    ),
    race(
      'C',
      { dem: 0.5, rep: 0.5, other: 0 },
      binary(0.5, 0, {
        isResolved: true,
        resolution: 'CANCEL',
        resolutionTime: 400,
      })
    ),
    race('D', { dem: 0.5, rep: 0.5, other: 0 }),
  ]
  assert.deepEqual(
    latestCalls(races).map((c) => c.race.id),
    ['B', 'A']
  )
})

const bet = (extra: Partial<Bet>) =>
  ({
    id: Math.random().toString(),
    userId: 'u1',
    contractId: 'c1',
    amount: 100,
    outcome: 'YES',
    probBefore: 0.4,
    probAfter: 0.45,
    isRedemption: false,
    createdTime: 0,
    shares: 0,
    ...extra,
  } as Bet)

test('boardTrades keeps one trade per trader and market, on board markets only', () => {
  const targets = new Map<string, TradeTarget>([
    [
      'c1',
      { label: 'PA Senate', yes: 'R', no: 'D', yesTone: 'rep', noTone: 'dem' },
    ],
    ['c2:a1', { label: 'AZ-6', yes: 'D', no: 'Not D', yesTone: 'dem' }],
  ])
  const trades = boardTrades(
    [
      bet({ amount: 100 }),
      // The same trader's arbitrage fill on the same market.
      bet({ amount: 20 }),
      bet({
        userId: 'u2',
        outcome: 'NO',
        amount: 50,
        probBefore: 0.6,
        probAfter: 0.55,
      }),
      bet({ userId: 'u3', contractId: 'c2', answerId: 'a1', amount: -30 }),
      bet({ userId: 'u4', amount: 5 }),
      bet({ userId: 'u5', amount: 500, isRedemption: true }),
      bet({ userId: 'u6', contractId: 'elsewhere', amount: 1000 }),
    ],
    targets
  )
  assert.deepEqual(
    trades.map((t) => [t.bet.userId, t.side, t.sold]),
    [
      ['u1', 'R', false],
      ['u2', 'D', false],
      ['u3', 'D', true],
    ]
  )
  const no = trades[1]
  assert.ok(Math.abs(no.from - 0.4) < 1e-9 && Math.abs(no.to - 0.45) < 1e-9)
})

test('boardTrades keeps a trader’s separate trades and folds one bet group', () => {
  const targets = new Map<string, TradeTarget>([
    ['c1', { label: 'PA Senate', yes: 'R', no: 'Not R', yesTone: 'rep' }],
  ])
  const trades = boardTrades(
    [
      bet({ amount: 100, createdTime: 1 }),
      // A later, smaller trade by the same trader on the same market.
      bet({ amount: 20, createdTime: 2 }),
      // One multi-choice purchase: the bet and its fill share a group.
      bet({ amount: 60, createdTime: 3, betGroupId: 'g' }),
      bet({ amount: 15, createdTime: 3, betGroupId: 'g', answerId: 'other' }),
    ],
    targets
  )
  assert.deepEqual(
    trades.map((t) => t.bet.amount),
    [100, 20, 60]
  )
})

import { sum } from 'lodash'
import { Answer } from './answer'
import { CPMMMultiContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'
import { getPayouts, groupPayoutsByUser } from './payouts'

const T0 = 1_700_000_000_000
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const answer = (id: string, index: number, createdTime: number): Answer => ({
  id,
  index,
  contractId: 'M',
  userId: 'creator',
  text: id,
  createdTime,
  poolYes: 100,
  poolNo: 100,
  p: 0.5,
  prob: 0.5,
  totalLiquidity: 100,
  subsidyPool: 0,
  volume: 0,
  probChanges: { day: 0, week: 0, month: 0 },
})

const market = (answers: Answer[]) =>
  ({
    id: 'M',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: false,
    subsidyPool: 0,
    answers,
  } as unknown as CPMMMultiContract)

const provision = (
  id: string,
  userId: string,
  amount: number,
  createdTime: number,
  fields: Partial<LiquidityProvision> = {}
): LiquidityProvision => ({
  id,
  userId,
  contractId: 'M',
  amount,
  createdTime,
  ...fields,
})

// An answer's own funding when it was listed.
const ante = (answerId: string, userId: string, createdTime: number) =>
  provision(`ante-${answerId}`, userId, 50, createdTime, {
    answerId,
    isAnte: true,
  })

// What each liquidity provider gets for one answer's resolution.
const providerPayouts = (
  outcome: string,
  answers: Answer[],
  liquidities: LiquidityProvision[],
  answerId: string
) =>
  groupPayoutsByUser(
    getPayouts(
      outcome,
      market(answers),
      [],
      liquidities,
      undefined,
      undefined,
      answerId
    ).liquidityPayouts
  )

describe('cancelling an answer of an independent multiple choice market', () => {
  it('refunds whole-market liquidity only to the answers it was split among', () => {
    // A and B were open when the whale's 90 went in. C came later.
    const answers = [
      answer('A', 0, T0),
      answer('B', 1, T0),
      answer('C', 2, T0 + 2 * HOUR),
    ]
    const liquidities = [
      ante('A', 'creator', T0),
      ante('B', 'creator', T0),
      provision('w', 'whale', 90, T0 + HOUR, { answerIds: ['A', 'B'] }),
      ante('C', 'adder', T0 + 2 * HOUR),
    ]
    expect(providerPayouts('CANCEL', answers, liquidities, 'A')).toEqual({
      creator: 50,
      whale: 45,
    })
    expect(providerPayouts('CANCEL', answers, liquidities, 'C')).toEqual({
      adder: 50,
    })
  })

  it('refunds recorded whole-market liquidity once across its answers', () => {
    const answers = [answer('A', 0, T0), answer('B', 1, T0), answer('C', 2, T0)]
    // C had resolved by the time the whale added 90.
    const liquidities = [
      provision('w', 'whale', 90, T0 + HOUR, { answerIds: ['A', 'B'] }),
    ]
    const refunds = ['A', 'B', 'C'].map(
      (id) => providerPayouts('CANCEL', answers, liquidities, id).whale ?? 0
    )
    expect(refunds).toEqual([45, 45, 0])
    expect(sum(refunds)).toBe(90)
  })

  it('refunds no earlier whole-market liquidity to answers added later', () => {
    // A provision from before provisions recorded their answers, which had
    // drizzled into A and B long before the later answers were listed.
    const answers = [answer('A', 0, T0), answer('B', 1, T0)]
    const liquidities = [
      ante('A', 'creator', T0),
      ante('B', 'creator', T0),
      provision('w', 'creator', 120, T0 + HOUR),
    ]
    const laterRefunds: number[] = []
    for (let i = 0; i < 5; i++) {
      const id = `L${i}`
      const listed = T0 + DAY + i * HOUR
      answers.push(answer(id, answers.length, listed))
      liquidities.push(ante(id, 'creator', listed))
      // Each later answer refunds its own funding and nothing more.
      const refund = providerPayouts('CANCEL', answers, liquidities, id)
      laterRefunds.push(refund.creator)
    }
    expect(laterRefunds).toEqual([50, 50, 50, 50, 50])
  })

  it('refunds unrecorded liquidity in full to the answers open when it was made', () => {
    const answers = [
      answer('A', 0, T0),
      answer('B', 1, T0),
      // Written with the provision, as a market's first answers can be.
      answer('C', 2, T0 + HOUR + 2 * SECOND),
      answer('D', 3, T0 + HOUR + 2 * MINUTE),
    ]
    const liquidities = [provision('w', 'whale', 120, T0 + HOUR)]
    const whaleRefunds = ['A', 'B', 'C', 'D'].map(
      (id) => providerPayouts('CANCEL', answers, liquidities, id).whale ?? 0
    )
    expect(whaleRefunds).toEqual([40, 40, 40, 0])
  })

  it('leaves out answers that had resolved before unrecorded liquidity came', () => {
    const answers = [
      {
        ...answer('A', 0, T0),
        resolution: 'YES' as const,
        resolutionTime: T0 + MINUTE,
      },
      answer('B', 1, T0),
      answer('C', 2, T0),
    ]
    const liquidities = [provision('w', 'whale', 120, T0 + HOUR)]
    expect(providerPayouts('CANCEL', answers, liquidities, 'B')).toEqual({
      whale: 60,
    })
  })

  it("keeps an older market's unrecorded ante at its old share", () => {
    // Before antes recorded their answer, they were dated at the market's
    // creation. An answer listed since then has an ante of its own.
    const answers = [
      answer('A', 0, T0),
      answer('B', 1, T0),
      answer('E', 2, T0 + DAY),
      answer('F', 3, T0 + 3 * DAY),
    ]
    const liquidities = [
      provision('x1', 'creator', 50, T0, { isAnte: true }),
      provision('x2', 'early', 50, T0, { isAnte: true }),
      provision('x3', 'early', 50, T0, { isAnte: true }),
      ante('F', 'adder', T0 + 3 * DAY),
    ]
    expect(providerPayouts('CANCEL', answers, liquidities, 'E')).toEqual({
      creator: 12.5,
      early: 25,
    })
    expect(providerPayouts('CANCEL', answers, liquidities, 'F')).toEqual({
      adder: 50,
    })
  })

  it("pays out no more of an older market's antes than went in", () => {
    // The market's creation funded A and B with 50 each. C's 25 was recorded
    // the old way, dated at the market's creation. D and E have their own.
    const funded = (id: string, index: number, at: number, pool: number) => ({
      ...answer(id, index, at),
      poolYes: pool,
      poolNo: pool,
    })
    const answers = [
      funded('A', 0, T0, 50),
      funded('B', 1, T0, 50),
      funded('C', 2, T0 + DAY, 25),
      funded('D', 3, T0 + 2 * DAY, 25),
      funded('E', 4, T0 + 2 * DAY, 25),
    ]
    const liquidities = [
      provision('x', 'creator', 100, T0, { isAnte: true }),
      provision('c', 'adder', 25, T0, { isAnte: true }),
      provision('d', 'creator', 25, T0 + 2 * DAY, {
        answerId: 'D',
        isAnte: true,
      }),
      provision('e', 'creator', 25, T0 + 2 * DAY, {
        answerId: 'E',
        isAnte: true,
      }),
    ]
    const paid = (outcome: string, id: string) =>
      sum(Object.values(providerPayouts(outcome, answers, liquidities, id)))
    const total =
      paid('YES', 'A') +
      paid('YES', 'B') +
      paid('CANCEL', 'C') +
      paid('CANCEL', 'D') +
      paid('CANCEL', 'E')
    expect(total).toBeLessThanOrEqual(175 + 1e-9)
  })
})

describe('resolving an answer of an independent multiple choice market', () => {
  const answers = [
    answer('A', 0, T0),
    answer('B', 1, T0),
    answer('C', 2, T0 + 2 * HOUR),
  ]

  it('weights recorded whole-market liquidity only in its answers', () => {
    const liquidities = [
      provision('a', 'creator', 50, T0, { answerId: 'A', isAnte: true }),
      provision('w', 'whale', 50, T0 + HOUR, { answerIds: ['A', 'B'] }),
      provision('c', 'adder', 50, T0 + 2 * HOUR, {
        answerId: 'C',
        isAnte: true,
      }),
    ]
    // Each pays out its pool of 100 YES shares.
    const a = providerPayouts('YES', answers, liquidities, 'A')
    expect(Object.keys(a).sort()).toEqual(['creator', 'whale'])
    expect(a.creator).toBeCloseTo((100 * 50) / 75)
    expect(a.whale).toBeCloseTo((100 * 25) / 75)
    expect(providerPayouts('YES', answers, liquidities, 'C')).toEqual({
      adder: 100,
    })
  })

  it('keeps unrecorded whole-market liquidity weighted in every answer', () => {
    const liquidities = [
      provision('w', 'whale', 60, T0 + HOUR),
      provision('c', 'adder', 20, T0 + 2 * HOUR, {
        answerId: 'C',
        isAnte: true,
      }),
    ]
    expect(providerPayouts('NO', answers, liquidities, 'C')).toEqual({
      whale: 50,
      adder: 50,
    })
  })
})

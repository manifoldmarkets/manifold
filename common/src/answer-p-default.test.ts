import { Answer, answerP } from './answer'
import { getAnswerProbability } from './calculate'
import { MultiContract } from './contract'

// Regression: answers deserialized from the denormalized contract data blob
// (data->'answers' — SSR/SEO/embeds, search "lite" answers) bypass convertAnswer's
// `row.p ?? 0.5` default, so any answer written before cpmm-multi-2 added `p` reads
// p === undefined at runtime despite Answer typing it as non-optional. A bare
// `answer.p` then poisons getCpmmProbability with NaN. answerP is the choke-point
// default; getAnswerProbability (and the client bet-preview paths) must use it.

const blobAnswer = (overrides: Partial<Answer> = {}): Answer =>
  // Cast through unknown: we are deliberately building the type-violating shape
  // (p missing) that real pre-p blob answers have at runtime.
  ({
    id: 'a1',
    index: 0,
    contractId: 'c1',
    userId: 'u1',
    text: 'answer one',
    createdTime: 0,
    poolYes: 100,
    poolNo: 300,
    prob: 0.75,
    totalLiquidity: 100,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    ...overrides,
  } as unknown as Answer)

describe('answerP', () => {
  it('defaults a missing p to 0.5', () => {
    expect(answerP(blobAnswer())).toBe(0.5)
  })

  it('passes through a stored p', () => {
    expect(answerP(blobAnswer({ p: 0.3 }))).toBe(0.3)
  })
})

describe('getAnswerProbability on a blob-sourced (p-less) answer', () => {
  const withAnswers = (...answers: Answer[]) =>
    ({ mechanism: 'cpmm-multi-1', answers } as MultiContract)

  it('returns the p=0.5 pool probability, not NaN', () => {
    const prob = getAnswerProbability(withAnswers(blobAnswer()), 'a1')
    expect(Number.isFinite(prob)).toBe(true)
    // p = 0.5: prob = NO / (YES + NO) = 300 / 400
    expect(prob).toBeCloseTo(0.75, 12)
  })

  it('still honors per-answer resolution fields', () => {
    expect(
      getAnswerProbability(withAnswers(blobAnswer({ resolution: 'NO' })), 'a1')
    ).toBe(0)
    expect(
      getAnswerProbability(withAnswers(blobAnswer({ resolution: 'YES' })), 'a1')
    ).toBe(1)
  })
})

import { computeRebalance } from './rebalance'

describe('computeRebalance', () => {
  it('no-ops on an empty position', () => {
    const result = computeRebalance({
      answerIds: ['a', 'b', 'c'],
      yesShares: {},
      noShares: {},
    })
    expect(result.minShares).toBe(0)
    expect(result.cashRedeemed).toBe(0)
    expect(result.finalYesShares).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('redeems YES-in-all to min across outcomes', () => {
    const result = computeRebalance({
      answerIds: ['a', 'b', 'c'],
      yesShares: { a: 5, b: 3, c: 7 },
      noShares: {},
    })
    expect(result.minShares).toBe(3)
    expect(result.cashRedeemed).toBe(3)
    expect(result.finalYesShares).toEqual({ a: 2, b: 0, c: 4 })
    expect(result.yesDelta).toEqual({ a: -3, b: -3, c: -3 })
    expect(result.noDelta).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('converts NO-in-multiple via share identity', () => {
    // NO shares: a=2, b=1, c=0 → totalNo=3.
    // effectiveYes: a = 0 + (3-2) = 1; b = 0 + (3-1) = 2; c = 0 + (3-0) = 3
    // min = 1 → redeem 1 share
    const result = computeRebalance({
      answerIds: ['a', 'b', 'c'],
      yesShares: {},
      noShares: { a: 2, b: 1 },
    })
    expect(result.minShares).toBe(1)
    expect(result.cashRedeemed).toBe(1)
    expect(result.finalYesShares).toEqual({ a: 0, b: 1, c: 2 })
    expect(result.yesDelta).toEqual({ a: 0, b: 1, c: 2 })
    expect(result.noDelta).toEqual({ a: -2, b: -1, c: 0 })
  })

  it('handles mixed YES and NO positions', () => {
    // yes: a=1, b=0, c=2. no: a=0, b=3, c=1. totalNo=4.
    // effectiveYes: a = 1 + (4-0) = 5; b = 0 + (4-3) = 1; c = 2 + (4-1) = 5
    // min = 1
    const result = computeRebalance({
      answerIds: ['a', 'b', 'c'],
      yesShares: { a: 1, c: 2 },
      noShares: { b: 3, c: 1 },
    })
    expect(result.minShares).toBe(1)
    expect(result.finalYesShares).toEqual({ a: 4, b: 0, c: 4 })
    expect(result.yesDelta).toEqual({ a: 3, b: 0, c: 2 })
    expect(result.noDelta).toEqual({ a: 0, b: -3, c: -1 })
  })

  it('is a no-op on an already-canonical position', () => {
    const result = computeRebalance({
      answerIds: ['a', 'b', 'c'],
      yesShares: { a: 3, b: 0, c: 5 },
      noShares: {},
    })
    expect(result.minShares).toBe(0)
    expect(result.cashRedeemed).toBe(0)
    expect(result.yesDelta).toEqual({ a: 0, b: 0, c: 0 })
    expect(result.noDelta).toEqual({ a: 0, b: 0, c: 0 })
    expect(result.finalYesShares).toEqual({ a: 3, b: 0, c: 5 })
  })

  it('redeems when NO appears in every outcome', () => {
    // NO in all three: 3, 2, 1. totalNo=6.
    // effectiveYes: 6-3=3, 6-2=4, 6-1=5. min = 3.
    // Post: YES = 0, 1, 2.
    const result = computeRebalance({
      answerIds: ['a', 'b', 'c'],
      yesShares: {},
      noShares: { a: 3, b: 2, c: 1 },
    })
    expect(result.minShares).toBe(3)
    expect(result.finalYesShares).toEqual({ a: 0, b: 1, c: 2 })
  })

  it('guards against a tiny negative min from float noise', () => {
    // If float subtraction produced -1e-15 somewhere, we clamp to 0
    // rather than "redeem" a negative number of shares.
    const result = computeRebalance({
      answerIds: ['a', 'b'],
      yesShares: { a: 1, b: 1 - 1e-15 },
      noShares: {},
    })
    expect(result.minShares).toBeGreaterThanOrEqual(0)
  })

  it('treats missing answers as zero position', () => {
    const result = computeRebalance({
      answerIds: ['a', 'b', 'c'],
      yesShares: { a: 5 },
      noShares: {},
    })
    // effectiveYes: a=5, b=0, c=0. min = 0. No redemption.
    expect(result.minShares).toBe(0)
    expect(result.finalYesShares).toEqual({ a: 5, b: 0, c: 0 })
  })

  it('preserves conservation: cash out + value retained = value in', () => {
    // Back-of-envelope invariant: under the share-identity frame, 1 YES in
    // every outcome = $1. So total "identity value" in = sum of YES + (N-1)
    // copies of each NO. After rebalance, NOs are gone and YES matches
    // finalYesShares. Cash covers the difference.
    const input = {
      answerIds: ['a', 'b', 'c'],
      yesShares: { a: 2, b: 1, c: 4 },
      noShares: { a: 1, b: 0, c: 2 },
    }
    const result = computeRebalance(input)

    const N = input.answerIds.length
    const valueIn =
      Object.values(input.yesShares).reduce((a, b) => a + b, 0) +
      (N - 1) * Object.values(input.noShares).reduce((a, b) => a + b, 0)
    const valueOut =
      Object.values(result.finalYesShares).reduce((a, b) => a + b, 0) +
      result.cashRedeemed * N
    // valueIn and valueOut are in units of "copies of (1 YES in each outcome)"
    // which is $1 per share. The factor-of-N on cashRedeemed reflects that
    // $1 cash = 1 YES in each outcome via the identity.
    expect(valueOut).toBeCloseTo(valueIn, 10)
  })
})

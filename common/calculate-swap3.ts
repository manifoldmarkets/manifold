type Swap3LiquidityProvision = {
  // TODO: Record who added this stuff?

  // Not sure if this is needed; maybe YES and NO left
  // amount: number // M$ quantity

  // For now, only support YES and NO outcome tokens
  // TODO: replace with Outcome
  // Hm, is this...
  // 1. Number of shares left in this particular pool?
  // 2. Fixed at injection time?
  pool: { YES: number; NO: number }

  // Uniswap uses 0.01, 0.003, 0.0005. Let's stick with 0.003 for now.
  // fee: number

  // Min/max is expressed as a odds ratio of cost of YES to cost of NO
  // E.g. ratio of 1 = 1:1 = 50%; ratio of 3 = 3:1 = 75%
  // minRatio: number
  // maxRatio: number
  minTick: number
  // minTick = loq_sqrt_1.0001(sqrtRatio)
  // sqrt(1.0001)^(minTick) = sqrtRatio
  // minRatio = 1.0001^minTick
  // e.g. minTick = 20k => 7.3883
  maxTick: number
}

// From https://uniswap.org/whitepaper-v3.pdf
export type Swap3Pool = {
  // id: string
  // userId: string
  // contractId: string
  // createdTime: number

  // 6.2 Global State
  liquidity: number // = sqrt(NY)
  sqrtRatio: number // = sqrt(N / Y); N = # NO shares in pool
  // So N = liquidity * sqrtRatio; Y = liquidity / sqrtRatio

  tick: number
  // Stored as optimization. equal to floor(log_sqrt_1.0001(sqrtRatio))
  // TODO add fees?
}

export function getSwap3Probability(pool: Swap3Pool) {
  // Probability is given by N / (N + Y)
  // const N = pool.liquidity * pool.sqrtRatio
  // const Y = pool.liquidity / pool.sqrtRatio
  // return N / (N + Y)

  // To check: this should be equal to toProb(pool.tick)?
  return toProb(pool.tick)
}

function calculatePurchase(
  pool: Swap3Pool,
  amount: number,
  outcome: 'YES' | 'NO'
) {
  const shares = 10
  const newPool = {}
}

export function calculateLPCost(
  curTick: number,
  minTick: number,
  maxTick: number,
  deltaL: number
) {
  const upperTick = Math.min(maxTick, Math.max(minTick, curTick))
  const costN = toRatio(upperTick) ** 0.5 - toRatio(minTick) ** 0.5

  const lowerTick = Math.max(minTick, Math.min(maxTick, curTick))
  const costY = 1 / toRatio(lowerTick) ** 0.5 - 1 / toRatio(maxTick) ** 0.5

  return {
    requiredN: deltaL * costN,
    requiredY: deltaL * costY,
  }
}

function toRatio(tick: number) {
  return 1.0001 ** tick
}

function toProb(tick: number) {
  const ratio = toRatio(tick)
  return ratio / (ratio + 1)
}

export function fromProb(prob: number) {
  const ratio = prob / (1 - prob)
  return Math.log(ratio) / Math.log(1.0001)
}

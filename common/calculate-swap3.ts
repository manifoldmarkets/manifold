type Swap3LiquidityPosition = {
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

type TickState = {
  tick: number

  // Amount of liquidity added when crossing this tick from left to right
  // Negative if we should remove liquidity
  liquidityNet: number

  // Total liquidity referencing this pool
  liquidityGross: number
}

// From https://uniswap.org/whitepaper-v3.pdf
export type Swap3Pool = {
  // id: string
  // userId: string
  // contractId: string
  // createdTime: number

  // 6.2 Global State
  liquidity: number // = sqrt(NY)
  // sqrtRatio: number // = sqrt(N / Y); N = # NO shares in pool
  // So N = liquidity * sqrtRatio; Y = liquidity / sqrtRatio

  // Current tick number.
  // Stored as optimization. equal to floor(log_sqrt_1.0001(sqrtRatio))
  tick: number
  // TODO add fees?

  // Mapping of tick indices to tick values.
  tickStates: TickState[]
}

export function noShares(pool: Swap3Pool) {
  return pool.liquidity * toRatio(pool.tick) ** 0.5
}

export function yesShares(pool: Swap3Pool) {
  return pool.liquidity / toRatio(pool.tick) ** 0.5
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
  amount: number, // In M$
  outcome: 'YES' | 'NO'
) {}

export function calculateLPCost(
  curTick: number,
  minTick: number,
  maxTick: number,
  deltaL: number
) {
  // TODO: this is subtly wrong, because of rounding between curTick and sqrtPrice
  // Also below in buyYES
  const upperTick = Math.min(maxTick, Math.max(minTick, curTick))
  const costN = toRatio(upperTick) ** 0.5 - toRatio(minTick) ** 0.5

  const lowerTick = Math.max(minTick, Math.min(maxTick, curTick))
  const costY = 1 / toRatio(lowerTick) ** 0.5 - 1 / toRatio(maxTick) ** 0.5

  return {
    requiredN: deltaL * costN,
    requiredY: deltaL * costY,
  }
}

// Returns a preview of the new pool + number of YES shares purchased.
// Does NOT modify the pool
// Hm, logic is pretty complicated. Let's see if we can simplify this.
export function buyYes(
  pool: Swap3Pool,
  amount: number // In M$
) {
  const tickStates = sortedTickStates(pool)
  let tick = pool.tick
  let stateIndex = 0
  let amountLeft = amount
  let yesPurchased = 0
  // Stop if there's epsilon M$ left, due to rounding issues
  while (amountLeft > 1e-6) {
    // Find the current & next states for this tick
    while (tick >= tickStates[stateIndex + 1].tick) {
      stateIndex++
      if (stateIndex > tickStates.length - 2) {
        // We've reached the end of the tick states...
        throw new Error('Ran out of tick states')
      }
    }
    const state = tickStates[stateIndex]
    const nextState = tickStates[stateIndex + 1]

    // nextState.tick purchases through the bucket; fullTick uses the remaining amountLeft
    const fullCostN = amountLeft / state.liquidityGross
    // Note: fullTick is NOT floored here; it's for the sqrtPrice to buy up to
    const fullTick = fromRatioUnfloored((fullCostN + toRatio(tick) ** 0.5) ** 2)
    const nextTick = Math.min(nextState.tick, fullTick)

    // Copied from above; TODO extract to common function?
    const noCost = toRatio(nextTick) ** 0.5 - toRatio(tick) ** 0.5
    const yesCost = 1 / toRatio(tick) ** 0.5 - 1 / toRatio(nextTick) ** 0.5

    amountLeft -= noCost * state.liquidityGross
    yesPurchased += yesCost * state.liquidityGross
    tick = Math.floor(nextTick)
  }

  // Right now we eat the epsilon amounntLeft as a fee. Could return it, shrug.
  return {
    newPoolTick: tick,
    yesPurchased,
  }
}

// Currently, this mutates the pool. Should it return a new object instead?
export function addPosition(
  pool: Swap3Pool,
  minTick: number,
  maxTick: number,
  deltaL: number
) {
  const { requiredN, requiredY } = calculateLPCost(
    pool.tick,
    minTick,
    maxTick,
    deltaL
  )
  // console.log(`Deducting required N: ${requiredN} and required Y: ${requiredY}`)

  // Add liquidity as we pass through the smaller tick
  const minTickState = pool.tickStates[minTick] || {
    tick: minTick,
    liquidityNet: 0,
    liquidityGross: 0,
  }

  minTickState.liquidityNet += deltaL
  pool.tickStates[minTick] = minTickState

  // And remove it as we pass through the larger one
  const maxTickState = pool.tickStates[maxTick] || {
    tick: maxTick,
    liquidityNet: 0,
    liquidityGross: 0,
  }

  maxTickState.liquidityNet -= deltaL
  pool.tickStates[maxTick] = maxTickState

  return pool
}

export function addBalancer(pool: Swap3Pool, p: number, deltaL: number) {
  // TODO: math is borked, shouldn't be returning infinity
  function tickL(tick: number) {
    const q = 1 - p
    return deltaL * 2 * p ** q * q ** p * 1.0001 ** ((p - 0.5) * tick)
  }

  // See how much liquidity is provided at +/- 5pp around p
  // const minTick = fromProb(p - 0.1)
  // const maxTick = fromProb(p + 0.05)
  const minTick = fromProb(0.000001)
  const maxTick = fromProb(0.999999)
  let totalN = 0
  let totalY = 0
  const stride = 300
  for (let t = minTick; t <= maxTick; t += stride) {
    // console.log('liquidity at tick ', t, toProb(t), tickL(t))
    const { requiredN, requiredY } = calculateLPCost(
      fromProb(p),
      t,
      t + stride,
      tickL(t)
    )
    totalN += requiredN
    totalY += requiredY
    // Add liquidity
    addPosition(pool, t, t + stride, tickL(t))
  }

  console.log('rough number of ticks', (maxTick - minTick) / stride)
  console.log(`Total N: ${totalN} and total Y: ${totalY}`)
  grossLiquidity(pool)
  return pool
}

// This also mutates the pool directly
export function grossLiquidity(pool: Swap3Pool) {
  let liquidityGross = 0
  for (const tickState of sortedTickStates(pool)) {
    liquidityGross += tickState.liquidityNet
    tickState.liquidityGross = liquidityGross
  }
  return pool
}

export function sortedTickStates(pool: Swap3Pool) {
  return Object.values(pool.tickStates).sort((a, b) => a.tick - b.tick)
}

function toRatio(tick: number) {
  return 1.0001 ** tick
}

export function toProb(tick: number) {
  const ratio = toRatio(tick)
  return ratio / (ratio + 1)
}

// Returns the tick for a given probability from 0 to 1
export function fromProb(prob: number) {
  const ratio = prob / (1 - prob)
  return fromRatio(ratio)
}

function fromRatio(ratio: number) {
  return Math.floor(Math.log(ratio) / Math.log(1.0001))
}

function fromRatioUnfloored(ratio: number) {
  return Math.log(ratio) / Math.log(1.0001)
}

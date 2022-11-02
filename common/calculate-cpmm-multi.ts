import { mapValues, sum } from 'lodash'

export function getProbability(
  pool: { [outcome: string]: number },
  outcome: string
) {
  if (pool[outcome] === undefined) throw new Error('Invalid outcome')

  const values = Object.values(pool)
  const ratioSum = sum(values.map((value) => pool[outcome] / value))
  return 1 / ratioSum
}

const getK = (pool: { [outcome: string]: number }) => {
  const values = Object.values(pool)
  return sum(values.map((value) => Math.log(value)))
}

function calculateBet(
  pool: {
    [outcome: string]: number
  },
  amount: number,
  outcome: string
) {
  if (pool[outcome] === undefined) throw new Error('Invalid outcome')

  const k = getK(pool)
  const tempPool = mapValues(pool, (s) => s + amount)
  const maxShares = tempPool[outcome]

  delete tempPool[outcome]
  const kMissingOutcome = getK(tempPool)
  const shares = maxShares - Math.exp(k - kMissingOutcome)

  tempPool[outcome] = maxShares - shares
  const newPool = tempPool

  return { newPool, shares }
}

function addOutcome(
  pool: {
    [outcome: string]: number
  },
  outcome: string,
  amount: number
) {
  // const poolWithNewOutcome = { ...pool, [outcome]: 999999999 }
  // const { newPool, shares } = calculateBet(poolWithNewOutcome, amount, outcome)

  const n = Object.keys(pool).length
  const k = getK(pool)
  const newK = k * ((n + 1) / n) //getK(poolWithMidOutcome)

  const largeConstant = 9999999999

  const poolWithLowShares = { ...pool, [outcome]: 0.000001 }
  const poolAfterPurchase = calculateBet(
    poolWithLowShares,
    largeConstant,
    outcome
  ).newPool

  const tempPool = mapValues(pool, (s) => s + amount)
  const poolWithNewOutcome = { ...pool, [outcome]: largeConstant }
  const kWithNewOutcome = getK(poolWithNewOutcome)
  const renormed = mapValues(
    poolWithNewOutcome,
    (s) => s ** (k / kWithNewOutcome)
  )
  const renormedK = getK(renormed)
  console.log('k', k, 'renormedK', renormedK, renormed)

  return calculateBet(renormed, amount, outcome)

  // const kWithOutcome = getK(poolWithNewOutcome)
  // console.log('k', k, 'newK', newK, 'kWithOutcome', kWithOutcome)
  // const shares = largeConstant - Math.exp(kWithOutcome - k)

  // poolWithNewOutcome[outcome] = largeConstant - shares
  // const newPool = poolWithNewOutcome

  // console.log('final k', getK(newPool))
  // return { newPool, shares }
}

export function test() {
  const pool = {
    A: 100,
    B: 100,
    C: 100,
  }

  const { newPool, shares } = addOutcome(pool, 'D', 10)
  console.log('add outcome D', newPool, shares, getProbability(newPool, 'D'))

  // console.log('prob before', getProbability(pool, 'C'))

  // const { newPool, shares } = calculateBet(pool, 100, 'C')
  // console.log('shares', shares, 'pool', pool, 'newPool', newPool)

  // console.log('prob after A', getProbability(newPool, 'A'))
  // console.log('prob after B', getProbability(newPool, 'B'))
  // console.log('prob after C', getProbability(newPool, 'C'))
  // console.log('prob after D', getProbability(pool, 'D'))
}

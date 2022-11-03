import { mapValues, sum } from 'lodash'
import { binarySearch } from './util/algos'

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

function calculateSale(
  pool: {
    [outcome: string]: number
  },
  shares: number,
  outcome: string
) {
  if (pool[outcome] === undefined) throw new Error('Invalid outcome')

  const k = getK(pool)
  const poolWithShares = { ...pool, [outcome]: pool[outcome] + shares }

  const saleAmount = binarySearch(0, shares, (saleAmount) => {
    const poolAfterSale = mapValues(poolWithShares, (s) => s - saleAmount)
    const kAfterSale = getK(poolAfterSale)
    return k - kAfterSale
  })

  const newPool = mapValues(poolWithShares, (s) => s - saleAmount)

  return { newPool, saleAmount }
}

function calculateShortSell(
  pool: {
    [outcome: string]: number
  },
  amount: number,
  outcome: string
) {
  if (pool[outcome] === undefined) throw new Error('Invalid outcome')

  const k = getK(pool)
  const poolWithAmount = mapValues(pool, (s) => s + amount)

  const shares = binarySearch(amount, amount * 2, (shares) => {
    const poolAfterPurchase = mapValues(poolWithAmount, (s, o) => o === outcome ? s : s - shares)
    const kAfterSale = getK(poolAfterPurchase)
    return k - kAfterSale
  })

  const newPool = mapValues(poolWithShares, (s) => s - saleAmount)

  return { newPool, saleAmount }
}

export function test() {
  const pool = {
    A: 100,
    B: 100,
    C: 100,
  }

  console.log('pool', pool, 'k', getK(pool))
  console.log('prob before', getProbability(pool, 'C'))

  const { newPool, shares } = calculateBet(pool, 10, 'C')
  console.log('shares', shares, pool, 'newPool', newPool, 'newK', getK(newPool))

  const { newPool: poolAfterSale, saleAmount } = calculateSale(
    newPool,
    shares,
    'C'
  )
  console.log(
    'sale amount',
    saleAmount,
    'pool after sale',
    poolAfterSale,
    'k',
    getK(poolAfterSale)
  )

  console.log('prob after A', getProbability(poolAfterSale, 'A'))
  console.log('prob after B', getProbability(poolAfterSale, 'B'))
  console.log('prob after C', getProbability(poolAfterSale, 'C'))
}

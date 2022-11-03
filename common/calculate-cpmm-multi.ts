import { mapValues, min, sumBy } from 'lodash'
import { binarySearch } from './util/algos'

export function getProb(pool: { [outcome: string]: number }, outcome: string) {
  if (pool[outcome] === undefined) throw new Error('Invalid outcome')

  const basis = pool[outcome]
  const ratioSum = sumBy(Object.values(pool), (value) => basis / value)
  return 1 / ratioSum
}

export function poolToProbs(pool: { [outcome: string]: number }) {
  return mapValues(pool, (_, outcome) => getProb(pool, outcome))
}

const getK = (pool: { [outcome: string]: number }) => {
  const values = Object.values(pool)
  return sumBy(values, Math.log)
}

export function buy(
  pool: {
    [outcome: string]: number
  },
  outcome: string,
  amount: number
) {
  if (amount <= 0) throw new Error('Amount must be positive')
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

export function sell(
  pool: {
    [outcome: string]: number
  },
  outcome: string,
  shares: number
) {
  if (shares <= 0) throw new Error('Shares must be positive')
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

export function shortSell(
  pool: {
    [outcome: string]: number
  },
  outcome: string,
  amount: number
) {
  if (amount <= 0) throw new Error('Amount must be positive')
  if (pool[outcome] === undefined) throw new Error('Invalid outcome')

  const k = getK(pool)
  const poolWithAmount = mapValues(pool, (s) => s + amount)

  const maxShares = min(Object.values(poolWithAmount)) as number
  const shares = binarySearch(amount, maxShares, (shares) => {
    const poolAfterPurchase = mapValues(poolWithAmount, (s, o) =>
      o === outcome ? s : s - shares
    )
    const kAfterSale = getK(poolAfterPurchase)
    return k - kAfterSale
  })

  const newPool = mapValues(poolWithAmount, (s, o) =>
    o === outcome ? s : s - shares
  )
  const gainedShares = mapValues(newPool, (s, o) => poolWithAmount[o] - s)

  return { newPool, gainedShares }
}

export function test() {
  const pool = {
    A: 100,
    B: 100,
    C: 100,
  }

  console.log('pool', pool, 'k', getK(pool))
  console.log('prob before', getProb(pool, 'C'))

  const { newPool, shares } = buy(pool, 'C', 10)
  console.log('shares', shares, pool, 'newPool', newPool, 'newK', getK(newPool))

  const { newPool: poolAfterSale, saleAmount } = sell(newPool, 'C', shares)
  console.log(
    'pool after sale',
    poolAfterSale,
    'sale amount',
    saleAmount,
    'k',
    getK(poolAfterSale),
    'probs',
    poolToProbs(poolAfterSale)
  )

  const { newPool: poolAfterShortSell, gainedShares } = shortSell(
    poolAfterSale,
    'C',
    1000000000
  )
  console.log(
    'poolAfterShortSell',
    poolAfterShortSell,
    'gained shares',
    gainedShares,
    'probs',
    poolToProbs(poolAfterShortSell),
    'k',
    getK(poolAfterShortSell)
  )

  const { newPool: poolAfterBuy, shares: sharesBought } = buy(
    poolAfterShortSell,
    'A',
    10
  )
  console.log(
    'poolAfterBuy',
    poolAfterBuy,
    'gained shares',
    sharesBought,
    'probs',
    poolToProbs(poolAfterBuy),
    'k',
    getK(poolAfterBuy)
  )
  const { newPool: poolAfterBuy2, shares: sharesBought2 } = buy(
    poolAfterShortSell,
    'C',
    10
  )
  console.log(
    'poolAfterBuy',
    poolAfterBuy2,
    'gained shares',
    sharesBought2,
    'probs',
    poolToProbs(poolAfterBuy2),
    'k',
    getK(poolAfterBuy2)
  )
}

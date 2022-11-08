export function calculatePrice(pool: { [outcome: string]: number }) {
  return pool['M$'] / pool['SHARE']
}

export function calculateShares(
  pool: { [outcome: string]: number },
  mana: number
) {
  // Calculate shares purchasable with this amount of mana
  // Holding the Uniswapv2 constant of k = mana * shares
  // TODO: Should this be done in log space for precision?
  return pool['SHARE'] - afterSwap(pool, 'M$', mana)['SHARE']
}

// Returns the new pool after the specified number of tokens are
// swapped into the pool
export function afterSwap(
  pool: { [outcome: string]: number },
  token: 'M$' | 'SHARE',
  amount: number
) {
  const k = pool['M$'] * pool['SHARE']
  const other = token === 'M$' ? 'SHARE' : 'M$'
  return {
    [token]: pool[token] + amount,
    [other]: k / (pool[token] + amount),
  }
}

export function calculatePriceAfterBuy(
  pool: { [outcome: string]: number },
  mana: number
) {
  return calculatePrice(afterSwap(pool, 'M$', mana))
}

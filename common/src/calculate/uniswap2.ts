export function calculatePrice(pool: { [outcome: string]: number }) {
  return pool['M$'] / pool['SHARE']
}

export function calculateShares(
  pool: { [outcome: string]: number },
  mana: number
) {
  // Calculate shares purchasable with this amount of mana
  // Holding the Uniswapv2 constant of k = mana * shares
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
  const newPool = {
    [token]: pool[token] + amount,
    // TODO: Should this be done in log space for precision?
    [other]: k / (pool[token] + amount),
  }
  // If any of the values in the new pool are invalid (infinite or NaN), throw an error
  if (Object.values(newPool).some((v) => !isFinite(v))) {
    throw new Error('Invalid new pool values: ' + JSON.stringify(newPool))
  }
  return newPool
}

export function calculatePriceAfterBuy(
  pool: { [outcome: string]: number },
  mana: number
) {
  return calculatePrice(afterSwap(pool, 'M$', mana))
}

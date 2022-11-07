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

/* 
txns for minting:
{
  fromId: 'BANK'
  toId: 'user/alice'
  amount: 10_000
  token: 'SHARE'
  description: 'user/alice mints 10_000 shares'
}

txns for initializing pool:
{
  fromId: 'user/alice'
  toId: 'contract/cert1234'
  amount: 500
  token: 'SHARE'
  description: 'user/alice adds 500 shares & 500 M$ to pool'
}
{
  fromId: 'user/alice'
  toId: 'contract/cert1234'
  amount: 500
  token: 'M$'
  description: 'user/alice adds 500 shares & 500 M$ to pool'
}

txns for buying:
{
  fromId: 'user/bob'
  toId: 'contract/cert1234'
  amount: 500
  token: 'M$'
  description: 'user/bob pays 500 M$ for 250 shares'
}
{
  fromId: 'contract/cert1234'
  toId: 'user/bob'
  amount: 250
  token: 'SHARE'
  description: 'user/bob pays 500 M$ for 250 shares'
}

txns for gifting:
{
  fromId: 'user/bob'
  toId: 'user/charlie'
  amount: 100
  token: 'SHARE'
  description: 'user/bob gifts 100 shares to user/charlie'
}

txns for sending dividends:
{
  fromId: 'user/alice'
  toId: 'user/bob',
  amount: 250
  token: 'M$'
  description: 'user/alice distributes 250 M$ to user/bob'
}

txns for resolving/burning: 
{
  fromId: 'user/alice'
  toId: 'BANK'
  amount: 250
  token: 'SHARE'
  description: 'user/alice burns 250 shares'
}

// Actually, should just use txns for everything?
// Either as a subcollection or just embedded into the contract
// Or using unique id map... nah, don't worry about collisions yet.
*/

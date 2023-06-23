// Run with `npx ts-node src/scripts/contest/resolve-markets.ts`

const DOMAIN = 'http://localhost:3000'
// Dev API key for Cause Exploration Prizes (@CEP)
// const API_KEY = '188f014c-0ba2-4c35-9e6d-88252e281dbf'
// DEV API key for Criticism and Red Teaming (@CARTBot)
const API_KEY = '6ff1f78a-32fe-43b2-b31b-9e3c78c5f18c'

// Warning: Checking these in can be dangerous!
// Prod API key for @CEPBot

// Can just curl /v0/group/{slug} to get a group
async function getGroupBySlug(slug: string) {
  const resp = await fetch(`${DOMAIN}/api/v0/group/${slug}`)
  return await resp.json()
}

async function getMarketsByGroupId(id: string) {
  // API structure: /v0/group/by-id/[id]/markets
  const resp = await fetch(`${DOMAIN}/api/v0/group/by-id/${id}/markets`)
  return await resp.json()
}

async function addLiquidityById(id: string, amount: number) {
  const resp = await fetch(`${DOMAIN}/api/v0/market/${id}/add-liquidity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${API_KEY}`,
    },
    body: JSON.stringify({
      amount: amount,
    }),
  })
  return await resp.json()
}

async function main() {
  const group = await getGroupBySlug('cart-contest')
  const markets = await getMarketsByGroupId(group.id)

  // Count up some metrics
  console.log('Number of markets', markets.length)

  // Resolve each market to NO
  for (const market of markets.slice(0, 3)) {
    console.log(market.slug, market.totalLiquidity)
    const resp = await addLiquidityById(market.id, 200)
    console.log(resp)
  }
}
main()

export {}

import { PoliticsPage } from 'politics/components/politics-page'
import { first } from 'lodash'
import { LiteMarket } from 'common/api/market-types'

export const revalidate = 60 // revalidate at most in seconds

async function getData() {
  const res = await fetch('https://api.manifold.markets/v0/markets')
  // The return value is *not* serialized
  // You can return Date, Map, Set, etc.

  if (!res.ok) {
    // This will activate the closest `error.js` Error Boundary
    throw new Error('Failed to fetch data')
  }

  return (await res.json()) as any as LiteMarket[]
}

export default async function Page() {
  const data = await getData()
  console.log('latest title', first(data ?? [])?.question)
  return <PoliticsPage trackPageView={false}>{data[0].question}</PoliticsPage>
}

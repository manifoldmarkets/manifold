import { PoliticsPage } from 'politics/components/politics-page'

export const revalidate = 5000 // revalidate at most every 5 seconds

async function getData() {
  const res = await fetch('https://api.manifold.markets/v0/markets')
  // The return value is *not* serialized
  // You can return Date, Map, Set, etc.

  if (!res.ok) {
    // This will activate the closest `error.js` Error Boundary
    throw new Error('Failed to fetch data')
  }

  return res.json()
}

export default async function Page() {
  const data = await getData()
  console.log('data', data)
  return <PoliticsPage trackPageView={false}>{data[0].question}</PoliticsPage>
}

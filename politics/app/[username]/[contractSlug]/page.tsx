import { PoliticsPage } from 'politics/components/politics-page'
import type { Metadata, ResolvingMetadata } from 'next'

export const dynamicParams = true
export const revalidate = 15000 // revalidate at most every 5 seconds

export async function generateStaticParams() {
  return []
}

export async function generateMetadata(
  props: { params: { contractSlug: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const market = await getMarket(props.params)
  // optionally access and extend (rather than replace) parent metadata
  const previousImages = (await parent).openGraph?.images || []

  return {
    title: market.question,
    openGraph: {
      images: [market.coverImageUrl, ...previousImages],
    },
  }
}

async function getMarket(params: { contractSlug: string }) {
  const res = await fetch(
    'https://api.manifold.markets/v0/market?slug=' + params.contractSlug,
    { next: { revalidate: 60 } }
  )

  const market = await res.json()
  console.log('market', market)

  return market
}

export default async function Page({
  params,
}: {
  params: { contractSlug: string }
}) {
  const market = await getMarket(params)

  return (
    <PoliticsPage
      trackPageView={'politics market page'}
      className={'bg-canvas-50'}
    >
      {market.question}
    </PoliticsPage>
  )
}

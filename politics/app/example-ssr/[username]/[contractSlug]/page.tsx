import type { Metadata, ResolvingMetadata } from 'next'
import { db } from 'web/lib/supabase/db'
import { filterDefined } from 'common/util/array'
import { getContractFromSlug } from 'web/lib/supabase/contracts'
import { Col } from 'web/components/layout/col'
import { config } from 'manifold-discord-bot/lib/constants/config'
import { FullMarket } from 'common/api/market-types'

export const dynamicParams = true
export const revalidate = 60
export async function generateStaticParams() {
  return []
}

export async function generateMetadata(
  props: { params: { contractSlug: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const market = await getContractFromSlug(props.params.contractSlug, db)
  if (!market) return { title: 'Not found' }
  // optionally access and extend (rather than replace) parent metadata
  const previousImages = (await parent).openGraph?.images || []

  return {
    title: market.question,
    openGraph: {
      images: filterDefined([market?.coverImageUrl, ...previousImages]),
    },
  }
}

const getMarketFromSlug = async (slug: string) => {
  const resp = await fetch(`${config.domain}api/v0/slug/${slug}`)
  if (!resp.ok) {
    throw new Error('Market not found with slug: ' + slug)
  }
  return (await resp.json()) as FullMarket
}

export default async function Page({
  params,
}: {
  params: { contractSlug: string }
}) {
  const market = await getMarketFromSlug(params.contractSlug)
  if (!market) return <Col>Not found</Col>
  return <Col>{market.question}</Col>
}

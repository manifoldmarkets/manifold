import { PoliticsPage } from 'politics/components/politics-page'
import type { Metadata, ResolvingMetadata } from 'next'
import { run } from 'common/supabase/utils'
import { Contract } from 'common/contract'
import { cache } from 'react'
import { db } from 'web/lib/supabase/db'
import { filterDefined } from 'common/util/array'
import Custom404 from 'politics/app/404/page'

export const dynamicParams = true
export const revalidate = 15000 // revalidate at most in milliseconds

export async function generateStaticParams() {
  return []
}

export async function generateMetadata(
  props: { params: { contractSlug: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const market = await getContractFromSlug(props.params.contractSlug)
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

export default async function Page({
  params,
}: {
  params: { contractSlug: string }
}) {
  const market = await getContractFromSlug(params.contractSlug)
  if (!market) return <Custom404 />
  return (
    <PoliticsPage
      trackPageView={'politics market page'}
      className={'bg-canvas-50'}
    >
      {market.question}
    </PoliticsPage>
  )
}

const getContractFromSlug = cache(async (contractSlug: string) => {
  const { data } = await run(
    db.from('contracts').select('data').eq('slug', contractSlug)
  )
  if (data.length === 0) return null
  return data[0].data as Contract
})

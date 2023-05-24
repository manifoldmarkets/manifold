import { GetServerSideProps } from 'next'
import { getServerSideSitemap, ISitemapField } from 'next-sitemap'
import { searchContract } from 'web/lib/supabase/contracts'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const contracts = await searchContract({
    query: '',
    filter: 'all',
    sort: 'score',
    limit: 5000,
  }).then((x) => x.data)

  const filteredContract = contracts.filter((x) => x.visibility === 'public')

  const score = (popularity: number) => Math.tanh(Math.log10(popularity + 1))

  const fields = filteredContract.map((market) => ({
    loc: `https://manifold.markets/${market.creatorUsername}/${market.slug}`,
    changefreq: market.volume24Hours > 10 ? 'hourly' : 'daily',
    priority: score(market.popularityScore ?? 0),
    lastmod: new Date(market.lastUpdatedTime ?? 0).toISOString(),
  })) as ISitemapField[]

  return await getServerSideSitemap(ctx, fields)
}

// Default export to prevent next.js errors
export default function Sitemap() {}

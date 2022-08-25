import { GetServerSideProps } from 'next'
import { getServerSideSitemap, ISitemapField } from 'next-sitemap'

import { listAllContracts } from 'web/lib/firebase/contracts'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const contracts = await listAllContracts(1000, undefined, 'popularityScore')

  const score = (popularity: number) => Math.tanh(Math.log10(popularity + 1))

  const fields = contracts
    .sort((x) => x.popularityScore ?? 0)
    .map((market) => ({
      loc: `https://manifold.markets/${market.creatorUsername}/${market.slug}`,
      changefreq: market.volume24Hours > 10 ? 'hourly' : 'daily',
      priority: score(market.popularityScore ?? 0),
      lastmod: market.lastUpdatedTime,
    })) as ISitemapField[]

  return await getServerSideSitemap(ctx, fields)
}

// Default export to prevent next.js errors
export default function Sitemap() {}

import _ from 'lodash'
import { GetServerSideProps } from 'next'
import { getServerSideSitemap, ISitemapField } from 'next-sitemap'

import { DOMAIN } from '../../common/envs/constants'
import { LiteMarket } from './api/v0/_types'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  // Fetching data from https://manifold.markets/api
  const response = await fetch(`https://${DOMAIN}/api/v0/markets`)

  const liteMarkets = (await response.json()) as LiteMarket[]
  const sortedMarkets = _.sortBy(liteMarkets, (m) => -m.volume24Hours)

  const fields = sortedMarkets.map((market) => ({
    // See https://www.sitemaps.org/protocol.html
    loc: market.url,
    changefreq: 'hourly',
    priority: market.volume24Hours + market.volume7Days > 100 ? 0.7 : 0.1,
    // TODO: Add `lastmod` aka last modified time
  })) as ISitemapField[]

  return await getServerSideSitemap(ctx, fields)
}

// Default export to prevent next.js errors
export default function Sitemap() {}

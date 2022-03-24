import { GetServerSideProps } from 'next'
import { getServerSideSitemap } from 'next-sitemap'
import { DOMAIN } from '../../common/envs/constants'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  // Fetching data from https://docs.manifold.markets/api
  const response = await fetch(`https://${DOMAIN}/api/v0/markets`)

  const liteMarkets = await response.json()
  const fields = liteMarkets.map((liteMarket: any) => ({
    // See https://www.sitemaps.org/protocol.html
    loc: liteMarket.url,
    changefreq: 'hourly',
    priority: 0.2, // Individual markets aren't that important
    // TODO: Add `lastmod` aka last modified time
  }))
  return getServerSideSitemap(ctx, fields)
}

// Default export to prevent next.js errors
export default function Sitemap() {}

const https = require('https')

/** @type {import('next-sitemap').IConfig} */

module.exports = {
  siteUrl: process.env.SITE_URL || 'https://manifold.markets',
  changefreq: 'hourly',
  priority: 0.7, // Set high priority by default
  additionalPaths,
  exclude: ['/admin'],
  generateRobotsTxt: true,
  // Other options: https://github.com/iamvishnusankar/next-sitemap#configuration-options
}

// See https://github.com/iamvishnusankar/next-sitemap#additional-paths-function
async function additionalPaths(config) {
  // Fetching data from https://docs.manifold.markets/api
  const response = await fetch(`${config.siteUrl}/api/v0/markets`)

  const liteMarkets = await response
  // See https://www.sitemaps.org/protocol.html
  return liteMarkets.map((liteMarket) => ({
    loc: liteMarket.url,
    changefreq: 'hourly',
    priority: 0.2, // Individual markets aren't that important
    // TODO: Add `lastmod` aka last modified time
  }))
}

// Polyfill for fetch: get the JSON contents of a URL
async function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve(JSON.parse(data))
      })
    })
  })
}

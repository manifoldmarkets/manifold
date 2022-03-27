/** @type {import('next-sitemap').IConfig} */

module.exports = {
  siteUrl: process.env.SITE_URL || 'https://manifold.markets',
  changefreq: 'hourly',
  priority: 0.7, // Set high priority by default
  exclude: ['/admin', '/server-sitemap.xml'],
  generateRobotsTxt: true,
  robotsTxtOptions: {
    additionalSitemaps: [
      'https://manifold.markets/server-sitemap.xml', // <==== Add here
    ],
  },
  // Other options: https://github.com/iamvishnusankar/next-sitemap#configuration-options
}

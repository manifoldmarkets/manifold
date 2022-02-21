const API_DOCS_URL =
  'https://manifoldmarkets.notion.site/Manifold-Markets-API-5e7d0aef4dcf452bb04b319e178fabc5'

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
    optimizeCss: true,
  },
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  async redirects() {
    return [
      {
        source: '/api',
        destination: API_DOCS_URL,
        permanent: false,
      },
      {
        source: '/api/v0',
        destination: API_DOCS_URL,
        permanent: false,
      },
    ]
  },
}

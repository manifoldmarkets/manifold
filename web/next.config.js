const API_DOCS_URL = 'https://docs.manifold.markets/api'

const ABOUT_PAGE_URL = 'https://help.manifold.markets/'

/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  staticPageGenerationTimeout: 600, // e.g. stats page
  reactStrictMode: true,
  optimizeFonts: false,
  experimental: {
    scrollRestoration: true,
    externalDir: true,
    modularizeImports: {
      '@heroicons/react/solid/?(((\\w*)?/?)*)': {
        transform: '@heroicons/react/solid/{{ matches.[1] }}/{{member}}',
      },
      '@heroicons/react/outline/?(((\\w*)?/?)*)': {
        transform: '@heroicons/react/outline/{{ matches.[1] }}/{{member}}',
      },

      lodash: {
        transform: 'lodash/{{member}}',
      },
    },
  },
  images: {
    domains: [
      'manifold.markets',
      'lh3.googleusercontent.com',
      'i.imgur.com',
      'firebasestorage.googleapis.com',
    ],
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
      {
        source: '/about',
        destination: ABOUT_PAGE_URL,
        permanent: false,
      },
      {
        source: '/analytics',
        destination: '/stats',
        permanent: true,
      },
    ]
  },
}

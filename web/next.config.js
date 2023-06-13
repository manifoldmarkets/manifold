const API_DOCS_URL = 'https://docs.manifold.markets/api'

/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  optimizeFonts: false,
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
  transpilePackages: ['common'],
  experimental: {
    scrollRestoration: true,
  },
  images: {
    dangerouslyAllowSVG: true,
    domains: [
      'manifold.markets',
      'lh3.googleusercontent.com',
      'i.imgur.com',
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'picsum.photos',
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
        source: '/analytics',
        destination: '/stats',
        permanent: true,
      },
      {
        source: '/labs',
        destination: '/about',
        permanent: true,
      },
      {
        source: '/sitemap',
        destination: '/about',
        permanent: false,
      },
      {
        source: '/versus',
        destination: '/VersusBot?tab=markets',
        permanent: false,
      },
      {
        source: '/privacy',
        destination: '/privacy.html',
        permanent: true,
      },
      {
        source: '/terms',
        destination: '/terms.html',
        permanent: true,
      },
      {
        source: '/umami',
        destination:
          'https://analytics.umami.is/share/ARwUIC9GWLNyowjq/Manifold%20Markets',
        permanent: false,
      },
      // NOTE: add any external redirects at common/envs/constants.ts and update native apps.
    ]
  },
}

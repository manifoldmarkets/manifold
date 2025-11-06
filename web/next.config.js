const API_DOCS_URL = 'https://docs.manifold.markets/api'

/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  // eslint config moved - run `next lint` separately in CI
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
    remotePatterns: [
      { hostname: 'manifold.markets' },
      { hostname: 'dev.manifold.markets' },
      { hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { hostname: 'lh3.googleusercontent.com' },
      { hostname: 'i.imgur.com' },
      { hostname: 'firebasestorage.googleapis.com' },
      { hostname: 'storage.googleapis.com' },
      { hostname: 'picsum.photos' },
      { hostname: '*.giphy.com' },
    ],
  },
  webpack: (config) => {
    // Find and remove the default SVG rule
    const fileLoaderRule = config.module.rules.find(
      (rule) => rule.test instanceof RegExp && rule.test.test('.svg')
    )

    if (fileLoaderRule) {
      fileLoaderRule.exclude = /\.svg$/
    }

    // Add SVGR loader for SVG files
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    })

    return config
  },
  async redirects() {
    return [
      {
        source: '/politics',
        destination: '/election',
        permanent: true,
      },
      {
        source: '/elections',
        destination: '/election',
        permanent: true,
      },

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
        destination: '/lab',
        permanent: true,
      },

      {
        source: '/versus',
        destination: '/VersusBot?tab=questions',
        permanent: false,
      },
      {
        source: '/privacy',
        destination: 'https://docs.manifold.markets/privacy-policy',
        permanent: true,
      },
      {
        source: '/terms',
        destination: 'https://docs.manifold.markets/terms',
        permanent: true,
      },
      {
        source: '/mana-only-terms',
        destination: 'https://docs.manifold.markets/terms',
        permanent: true,
      },
      {
        source: '/sweepstakes-rules',
        destination: 'https://docs.manifold.markets/sweepstakes-rules',
        permanent: true,
      },
      {
        source: '/umami',
        destination:
          'https://analytics.umami.is/share/ARwUIC9GWLNyowjq/Manifold%20Markets',
        permanent: false,
      },
      {
        source: '/this-month',
        destination: '/browse?f=closing-this-month&s=most-popular',
        permanent: true,
      },
      {
        source: '/search',
        destination: '/browse',
        permanent: true,
      },
      {
        source: '/browse/for-you',
        destination: '/browse?fy=1&f=open',
        permanent: true,
      },
      {
        source: '/find',
        destination: '/browse',
        permanent: true,
      },
      {
        source: '/groups',
        destination: '/browse?t=Topics',
        permanent: true,
      },
      {
        source: '/group/:slug*',
        destination: '/topic/:slug*',
        permanent: true,
      },
      {
        source: '/browse/:slug+',
        destination: '/topic/:slug+',
        permanent: false,
      },
      {
        source: '/old-posts/:slug*',
        destination: '/post/:slug*',
        permanent: true,
      },
      {
        source: '/questions',
        destination: '/browse',
        permanent: true,
      },
      {
        source: '/dashboard/:slug',
        destination: '/news/:slug',
        permanent: true,
      },
      {
        source: '/home/:newsSlug*',
        has: [
          {
            type: 'query',
            key: 'tab',
            value: '(?<tab>.*)',
          },
        ],
        permanent: false,
        destination: '/news/:tab',
      },
      {
        source: '/news/:newsSlug*',
        has: [
          {
            type: 'query',
            key: 'tab',
            value: '(?<tab>.*)',
          },
        ],
        permanent: false,
        destination: '/news/:tab',
      },
      {
        source: '/:username/portfolio',
        destination: '/:username',
        permanent: false,
      },
      {
        source: '/browse',
        has: [
          {
            type: 'query',
            key: 'topic',
            // Using a named capture group to capture the value of 'topic'
            value: '(?<topic>.*)',
          },
        ],
        permanent: true,
        destination: '/browse/:topic', // Using the captured value here
      },
      // NOTE: add any external redirects at common/envs/constants.ts and update native apps.
    ]
  },
}

const API_DOCS_URL = 'https://docs.manifold.markets/api'

/** @type {import('next').NextConfig} */
module.exports = {
  staticPageGenerationTimeout: 600, // e.g. stats page
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    externalDir: true,
    optimizeCss: true,
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
    // Setting to bypass build error for `next export`, see https://stackoverflow.com/a/70047180/1222351
    loader: 'akamai',
    path: '',
    domains: ['lh3.googleusercontent.com', 'i.imgur.com'],
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
    ]
  },
}

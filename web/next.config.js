const API_DOCS_URL = 'https://docs.manifold.markets/api'

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
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

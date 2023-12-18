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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: '**.giphy.com',
      },
      {
        protocol: 'https',
        hostname: 'manifold.markets',
      },
      {
        protocol: 'https',
        hostname: 'manifoldpolitics.com',
      },
    ],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.svg$/,
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            svgoConfig: {
              plugins: [{ name: 'removeViewBox', active: false }],
              floatPrecision: 2,
            },
          },
        },
      ],
    })
    return config
  },
  async redirects() {
    return [
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
      // NOTE: add any external redirects at common/envs/constants.ts and update native apps.
    ]
  },
}

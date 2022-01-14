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
}

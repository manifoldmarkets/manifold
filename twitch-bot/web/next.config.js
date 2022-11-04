module.exports = {
  async rewrites() {
    return [
      {
        source: '/socket.io',
        destination: 'http://localhost:9172/socket.io/', // Proxy to Backend
      },
      {
        source: '/api/:slug',
        destination: 'http://localhost:9172/api/:slug', // Proxy to Backend
      },
    ];
  },
  experimental: {
    externalDir: true,
  },
};

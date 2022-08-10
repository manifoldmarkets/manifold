module.exports = {
    async rewrites() {
      return [
        {
          source: '/socket.io',
          destination: 'http://localhost:31452/socket.io/' // Proxy to Backend
        }
      ]
    }
  }
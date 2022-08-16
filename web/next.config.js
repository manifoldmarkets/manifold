module.exports = {
    async rewrites() {
        return [
            {
                source: "/socket.io",
                destination: "http://localhost:9172/socket.io/", // Proxy to Backend
            },
            {
                source: "/api/:slug",
                destination: "http://localhost:9172/:slug", // Proxy to Backend
            },
        ];
    },
    env: {
        TWTICH_APP_CLIENT_ID: process.env.TWTICH_APP_CLIENT_ID,
    },
};

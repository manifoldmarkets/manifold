module.exports = {
  apps: [
    {
      name: 'serve',
      script: 'backend/api/lib/serve.js',
      // Restart the app every hour
      // cron_restart: '0 * * * *',
      instances: 1,
      autorestart: true,
      watch: false,
      // 32 GB on the box, give 28 GB to the JS heap
      node_args: '--max-old-space-size=28672',
    },
  ],
}

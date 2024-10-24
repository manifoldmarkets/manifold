module.exports = {
  apps: [
    {
      name: 'serve',
      script: 'backend/api/lib/serve.js',
      // Restart every hour
      cron_restart: '0 * * * *',
      instances: 1,
      autorestart: true,
      watch: false,
      // 16 GB on the box, give 12 GB to the JS heap
      node_args: '--max-old-space-size=12288',
    },
  ],
}

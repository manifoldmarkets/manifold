module.exports = {
  apps: [
    {
      name: 'serve',
      script: 'backend/api/lib/serve.js',
      // Restart every day at 2/3 AM LA time (UTC-7/8)
      cron_restart: '0 10 * * *',
      instances: 1,
      autorestart: true,
      watch: false,
      // 16 GB on the box, give 12 GB to the JS heap
      node_args: '--max-old-space-size=12288',
      env: {
        PORT: 8088,
      },
    },
    {
      name: 'serve-read',
      script: 'backend/api/lib/serve.js',
      instances: 3, // Use 3 cores for read API
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      env: {
        PORT: 8089,
        IS_READ_ONLY: 'true',
      },
    },
  ],
}

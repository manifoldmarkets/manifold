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
        PORT: 8090,
      },
    },
    {
      name: 'serve-read',
      script: 'backend/api/lib/serve.js',
      instances: '3',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      node_args: '--max-old-space-size=12288',
      increment_var: 'PORT',
      env: {
        PORT: 8091,
        READ_ONLY: true,
      },
    },
  ],
}

module.exports = {
  apps: [
    {
      name: 'serve',
      script: 'backend/api/lib/serve.js',
      // Restart the app every hour
      cron_restart: '0 * * * *',
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
}

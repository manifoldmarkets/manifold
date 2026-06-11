module.exports = {
  apps: [
    {
      name: 'serve',
      script: 'backend/api/lib/serve.js',
      // Restart daily at 08:00 UTC (midnight/1 AM LA). pm2 crons use the VM's
      // clock (UTC), unlike the scheduler's jobs which run in LA time. The
      // restart kicks off initCaches' user-interests build, a heavy db read;
      // keep it clear of the scheduler's 2:00-5:30 AM LA maintenance pile,
      // which already pins db disk throughput at its cap around 09:30-11:30
      // UTC each morning (this stack-up caused the June 2026 outages).
      cron_restart: '0 8 * * *',
      instances: 1,
      autorestart: true,
      watch: false,
      // 16 GB on the box, give 12 GB to the JS heap
      node_args: '--max-old-space-size=12288',
      env: {
        PORT: 80,
        // Cap statement runtime server-side (incl. lock waits) for
        // request-serving processes. The scheduler runs without a cap.
        // See createSupabaseDirectClient in shared/src/supabase/init.ts.
        PG_STATEMENT_TIMEOUT_MS: 60000,
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
        PORT: 8090,
        READ_ONLY: true,
        PG_STATEMENT_TIMEOUT_MS: 60000,
      },
    },
  ],
}

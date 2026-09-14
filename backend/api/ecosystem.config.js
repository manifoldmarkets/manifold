module.exports = {
  apps: [
    {
      name: 'serve',
      script: 'backend/api/lib/serve.js',
      // No cron_restart: a PM2 restart kills this process (the only write
      // server) before its replacement listens, which took the API down for
      // minutes every morning. The user-interests cache the daily restart
      // used to rebuild now refreshes in-process at 08:00 UTC; see
      // scheduleDailyCacheRefresh in backend/shared/src/init-caches.ts.
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

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
        PORT: 80,
        // 'both' = keep doing fan-out locally AND publish to the fan-out tier, so
        // there is no broadcast gap while clients are still routed to /ws here.
        // After /ws is routed to the fan-out tier (url-map-config.yaml), switch this
        // to 'publish' to take fan-out off the write event loop entirely.
        BROADCAST_BRIDGE: 'both',
      },
    },
    {
      // Dedicated fan-out tier: owns the websocket connections and does the
      // per-socket sends, fed by the write process over the local bridge. Keeps
      // spectator fan-out off the write process's single event loop. The process
      // self-forks FANOUT_WORKERS workers (defaults to cores-1).
      name: 'fanout',
      script: 'backend/api/lib/fanout.js',
      cron_restart: '0 10 * * *',
      instances: 1,
      autorestart: true,
      watch: false,
      node_args: '--max-old-space-size=12288',
      env: {
        FANOUT_PORT: 8080,
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
      },
    },
  ],
}

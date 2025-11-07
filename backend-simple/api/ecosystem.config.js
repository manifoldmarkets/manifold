module.exports = {
  apps: [
    {
      name: 'manifold-backend-simple',
      script: './dist/serve.js',
      instances: 'max', // Use all available CPUs
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 8080,
      },
      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      combine_logs: true,
      // Auto-restart
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,
      // Watch for changes (disable in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
    },
  ],
}

/**
 * PM2 Ecosystem Configuration
 * 
 * Cluster mode for Next.js application.
 * Runs multiple instances for:
 * - Better CPU utilization
 * - Zero-downtime reloads
 * - Fault tolerance
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 reload shopaccounting    # Zero-downtime restart
 *   pm2 monit                     # Monitor all instances
 *   pm2 logs                      # View logs
 */

module.exports = {
  apps: [
    {
      name: 'shopaccounting',
      script: '.next/standalone/server.js',

      // ---- Cluster Mode ----
      exec_mode: 'cluster',
      instances: 'max',  // One per CPU core (or set specific number like 4)
      // Or set specific: instances: 4,

      // ---- Environment ----
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },

      // ---- Logging ----
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,  // Merge logs from all instances
      log_type: 'json',

      // ---- Auto-restart ----
      max_memory_restart: '1G',  // Restart if memory exceeds 1GB
      min_uptime: '10s',         // Consider app crashed if exits within 10s
      max_restarts: 10,          // Max restarts within min_uptime
      restart_delay: 4000,       // 4s between restarts

      // ---- Graceful Shutdown ----
      kill_timeout: 15000,       // Wait 15s for graceful shutdown
      listen_timeout: 10000,     // Wait 10s for app to start listening
      send_signal: 'SIGINT',     // Send SIGINT for graceful shutdown

      // ---- Watch (development only) ----
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.next'],

      // ---- Advanced ----
      cron_restart: '0 3 * * *',  // Auto-restart daily at 3 AM
      autorestart: true,
    },

    // ---- BullMQ Worker Process ----
    {
      name: 'shopaccounting-worker',
      script: './workers/start.ts',

      // Single instance for workers (avoid duplicate job processing)
      exec_mode: 'fork',
      instances: 1,

      env: {
        NODE_ENV: 'production',
        WORKER_MODE: 'true',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      merge_logs: true,

      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 10,

      kill_timeout: 30000,  // Workers need more time to finish current job
      listen_timeout: 15000,

      autorestart: true,
    },
  ],

  // ---- Deployment Configuration ----
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/shopaccounting-v2.git',
      path: '/var/www/shopaccounting',
      'pre-deploy-local': '',
      'post-deploy':
        'npm install && npx prisma generate && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
}

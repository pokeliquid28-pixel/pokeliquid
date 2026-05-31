"use strict";

module.exports = {
  apps: [
    {
      name: "pokeliquid-keeper",
      script: "keeper.js",
      cwd: __dirname,

      // Restart automatically on crash, with exponential back-off
      autorestart: true,
      max_restarts: 10,
      min_uptime: "30s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,

      // Log config
      out_file: "./logs/keeper-out.log",
      error_file: "./logs/keeper-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DDTHH:mm:ssZ",

      // Environment
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

module.exports = {
  apps: [
    {
      name: 'asset-manager-api',
      script: 'apps/api/dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'asset-manager-worker',
      script: 'apps/worker/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

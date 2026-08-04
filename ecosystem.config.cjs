module.exports = {
  apps: [{
    name: 'blockblast',
    script: 'server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '0.0.0.0'
    }
  }]
};

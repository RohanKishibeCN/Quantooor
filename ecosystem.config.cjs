module.exports = {
  apps: [
    {
      name: "quantooor-api",
      cwd: __dirname,
      script: "arbitrage-scanner/artifacts/api-server/dist/index.mjs",
      interpreter: "node",
      node_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

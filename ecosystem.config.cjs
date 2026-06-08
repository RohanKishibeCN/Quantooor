module.exports = {
  apps: [
    {
      name: "minara-orchestrator",
      cwd: __dirname,
      script: "dist/index.js",
      interpreter: "node",
      node_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};


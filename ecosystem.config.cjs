// platform-web 常驻开发服务器（Windows 下 pm2 不能直接跑 npm.cmd，
// 这里以 node 脚本方式启动 vite，等价于 npm run dev）。
module.exports = {
  apps: [
    {
      name: 'platform-web',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host 127.0.0.1 --port 5174',
      cwd: __dirname,
      env: { NODE_ENV: 'development' },
      time: true,
    },
  ],
}

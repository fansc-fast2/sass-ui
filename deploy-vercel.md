# Vercel 部署指南（platform-web 前端）

版本 1.0 · 2026-09-27 · 前端上 Vercel，API 留在 Back4app（或任意 https 源）

## 1. 原理

Vercel 托管 Vite 构建的 SPA（静态文件），`vercel.json` 的 **rewrites 把
API 路径同源代理到后端**：

```
浏览器 ── HTTPS ──▶ <app>.vercel.app（Vercel）
                      ├── 静态文件（vite dist）+ 路由回退 index.html
                      └── /health /v1 /ops /shopify /executor /integrations
                            ── 代理 ──▶ https://<back4app-api-url>（Back4app 容器）
```

浏览器视角全部同源，**零 CORS、零代码改动**（client.ts 仍用相对路径）。

## 2. 部署步骤

1. **先部署后端**——后端同样推荐 Vercel（见 platform-backend 仓库
   `docs/deploy-vercel.md`），拿到 API 公网 URL，形如
   `https://sass-api-xxxx.vercel.app`；Back4app 容器形态的
   `https://sassapi-4ei6fxv5.b4a.run` 同样可用（当前已验证在线）。
2. 把该 URL 填进本仓库根目录 `vercel.json`——全文替换
   `API_ORIGIN_REPLACE_ME`（共 7 处，含 `/health` 一行）并提交：
   ```
   git add vercel.json
   git commit -m "deploy: 填入生产 API origin"
   ```
3. 在 GitHub 建仓库（如 `fansc-fast2/platform-web`）并推送 main：
   ```
   git remote add github https://github.com/fansc-fast2/platform-web.git
   git push -u github main
   ```
4. Vercel Console → **Add New… → Project** → Import 该 GitHub 仓库。
   Framework Preset 自动识别 **Vite**；Build Command `npm run build`、
   Output Directory `dist`（vercel.json 已固定，无需手填）→ **Deploy**。
5. 部署完成后验证：
   - `https://<app>.vercel.app/` 打开登录页；
   - `https://<app>.vercel.app/health` 返回后端 `{"status":"ok"}`（代理生效）；
   - 用种子账号登录 → 能进工作台即全链路通。
6. 此后 **push main 自动部署**（Vercel Git 集成默认开启）；非 main 分支
   自动产生 preview 部署，PR 有独立预览链接。

## 3. 常用配置

| 事项 | 说明 |
|---|---|
| 自定义域名 | Vercel Project → Settings → Domains（DNS 加 CNAME 即可） |
| 环境变量 | 前端不需要——API 地址写死在 vercel.json 的 rewrites 里 |
| 换 API 地址 | 改 vercel.json 里 7 处 origin，push 即自动重部署 |
| 构建缓存 | Vercel 自动处理 npm 缓存，无需配置 |

## 4. 注意事项（诚实边界）

- ** SPA 回退**：vercel.json 最后一条 rewrite 把未知路径回退到 index.html，
  `/optimization`、`/ops` 直达刷新不 404；`/assets/*` 是真实文件，Vercel
  文件系统优先，不受影响。
- **rewrites 是 Vercel 边缘代理**：计费上计入 Vercel 请求数（免费档足够
  演示/小流量）。
- **后端仍需先可用**：API 未部署或填错 origin 时，站点能打开但登录/数据
  全部失败（fetch 报网络错误）——先按第 1 步把后端跑起来。
- 本地开发不受影响：`npm run dev` 走 vite 代理（vite.config.ts）。
- 仓库里的 `Dockerfile` + `nginx.conf.template` 是自托管备选（Back4app
  容器/NAS 均可），与 Vercel 部署二选一，互不冲突。

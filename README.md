# platform-web

商品知识与 SEO 平台（platform-backend，Go）的管理前端。对齐 `docs/product-knowledge-devkit-v1.8`：
**31 个 /v1 操作**、hash schema **v2**（双基线授权哈希，前端只展示服务端 hash 不自行改写）、
恢复契约 `baseline=published_baseline`、PublicationCheck 证据契约（required/check_version/evidence_ref）、
证据元数据分层（visibility）、navigation.json 信息架构与状态文案、22 章 M2a/M2b 交付切片。

## 技术栈

Vite 7 + React 19 + TypeScript（标准库之外零运行时依赖），无第三方 UI 组件库。

## 运行

```bash
npm install
npm run dev        # http://127.0.0.1:5174 （代理 /health /v1 /integrations → 127.0.0.1:8090）
npm run build      # tsc --noEmit + vite build（产物 dist/）
npm run preview    # 本地预览 dist，同样带代理
```

后端：`platform-backend`（pm2: platform-api，`http://127.0.0.1:8090`）。
改后端地址：设 `PLATFORM_API_URL` 环境变量。

## 登录

测试身份模拟器（M0 Q06）：凭据格式 `test-cred:<租户>:<用户>:<角色>[:<站点 csv>]`，
角色阶梯（09 §1 权限矩阵）：

| 角色 | 权限 |
|---|---|
| viewer | connection.read · knowledge.read · change.read · job.read |
| analyst | + knowledge.sync · seo.audit · change.propose |
| knowledge_reviewer | + knowledge.verify |
| publisher | + change.authorize · change.execute · change.restore · job.cancel |
| operations | 仅 job.read |

前端按同一矩阵预判按钮可用性；服务端始终是权威（403 以接口为准）。

## 页面（v1.6 信息架构：M2a 核心入口在前，M2b 体验增强后移）

默认落地**首个可访问的已实现业务页**（商品与知识，22 §2）。侧栏顶部为当前租户切换器
（切租户取消旧请求并清空缓存，21 §1 路径 D）。导航中「工作台」标 M2b、「AI 工作区」标接入中。

- **商品与知识**（/products + /products/:id，P02）：listProducts 只读投影（q/site_id/freshness 筛选）、
  商品详情五标签（概览/知识与规格/资料与证据/问题与建议/变更与发布）；
  线上观测按 v1.6 F04 展示**比较状态**（可比/不可比/未检查 + 原因 + conditions_id/mapping_version），
  前端不按文字判冲突；动作：同步/审计/发起优化提案（带对象上下文跳转）
- **站点与渠道**（/sites + /sites/:id，P04）：listSites 列表、站点详情与连接能力
- **优化中心**（/optimization，P05）：三标签按首个有权限标签进入（F01）——
  问题（listIssues+getIssue、豁免/核验）、提案（listChangeSets 摘要 + 起草→授权→执行向导）、
  效果（listJobs type=execute + getExecution，不做流量指标）
- **任务中心**（/tasks，P06）：listJobs 摘要列表、任务详情含**分类型聚合 result**
  （成功/失败/取消/跳过分项，issues_found 仅 audit）、retry_of 与恢复说明（F09：恢复生成新提案，
  原终态历史不原位重跑）、取消/轮询/失败项恢复
- **工作台**（/overview，M2b 体验增强）：getOverview 数据概况（卡片状态区分可用/未接通/未检查/不可用，
  未接入不显示 0）、待办、进行中、近期活动
- **AI 工作区**（/ai，按阶段接入）：未接通时只显示说明与只读入口，不生成伪聊天
- **资料与证据**（/evidence，P03）：只读索引 + 详情（ACL：can_view_excerpt=false 不返回摘录）
- **设置**（footer）：租户注册表（Q06 接入前本机维护）、测试凭据、连接能力查询、31 操作权限一览

## 集成约定（对照后端 transport 包）

- 响应信封 `{request_id, data}`；错误 `{request_id, error:{code,message,retryable}}`（apierr）
- 所有 POST 自动携带 `Idempotency-Key`（crypto.randomUUID）；重试换新键
- 严格 JSON：请求体只发送契约字段，多余字段会被后端 400 拒收
- 401 → 顶部提示检查凭据；503 + `X-Degraded-Mode: readonly` → 只读降级横幅
- 当前 `/v1` 为骨架处理器（stub）语义：契约形状真实，ID 为占位数据；
  知识/问题/变更域落库后（T17 后续批次）页面无需改动即可切换真实数据

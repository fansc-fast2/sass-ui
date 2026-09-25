// 前后端集成冒烟：从 vite 代理（5174）走完 16 条 /v1 契约路由 + 鉴权/幂等/错误信封。
// 用法：node scripts/smoke.mjs [baseUrl]，默认 http://127.0.0.1:5174。
// 退出码 0 = 全部通过；1 = 有失败。

const BASE = process.argv[2] ?? 'http://127.0.0.1:5174'
const CRED = 'test-cred:acme:frank:publisher'
const AUTH = { Authorization: `Bearer ${CRED}` }

let failures = 0
let step = 0

function check(name, cond, detail = '') {
  step += 1
  const tag = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`${String(step).padStart(2, '0')} [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function call(method, path, { body, headers = {}, key, auth = true } = {}) {
  const h = { ...(auth ? AUTH : {}), ...headers, Accept: 'application/json' }
  if (method === 'POST') {
    h['Content-Type'] = 'application/json'
    h['Idempotency-Key'] = key ?? crypto.randomUUID()
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json, headers: res.headers }
}

const data = (r) => r.json?.data
const errCode = (r) => r.json?.error?.code

// ---- 0. 健康 ----
const health = await call('GET', '/health')
check('GET /health', health.status === 200 && health.json?.status === 'ok')

// ---- 1. 鉴权 ----
const noAuth = await call('GET', '/v1/issues', { auth: false })
check('无凭据 → 401', noAuth.status === 401 && errCode(noAuth) === 'UNAUTHENTICATED',
  `status=${noAuth.status} code=${errCode(noAuth)}`)

const badAuth = await call('GET', '/v1/issues', { headers: { Authorization: 'Bearer test-cred:acme:frank:nope' } })
check('坏角色 → 401', badAuth.status === 401, `status=${badAuth.status}`)

const viewerRead = await call('GET', '/v1/issues', { headers: { Authorization: 'Bearer test-cred:acme:v:viewer' } })
check('viewer 可读 issues', viewerRead.status === 200)

const viewerWrite = await call('POST', '/v1/sync-jobs', {
  headers: { Authorization: 'Bearer test-cred:acme:v:viewer' },
  body: { connection_id: 'c', product_ids: ['p'] },
})
check('viewer 写作业 → 403', viewerWrite.status === 403 && errCode(viewerWrite) === 'FORBIDDEN',
  `status=${viewerWrite.status} code=${errCode(viewerWrite)}`)

// ---- 2. 连接能力 ----
const caps = await call('GET', '/v1/connections/cms-main/capabilities')
check('GET capabilities', caps.status === 200 && data(caps)?.connection_id === 'cms-main'
  && typeof data(caps)?.management_mode === 'string')

// ---- 3. 严格 JSON ----
const unknownField = await call('POST', '/v1/sync-jobs', {
  body: { connection_id: 'c', product_ids: ['p'], tenant_id: 'spoof' },
})
check('未知字段 tenant_id → 400', unknownField.status === 400 && errCode(unknownField) === 'INVALID_REQUEST',
  `status=${unknownField.status} code=${errCode(unknownField)}`)

// ---- 4. 幂等 ----
const idemKey = crypto.randomUUID()
const body1 = { connection_id: 'cms-main', product_ids: ['prod-001'] }
const first = await call('POST', '/v1/sync-jobs', { body: body1, key: idemKey })
const replay = await call('POST', '/v1/sync-jobs', { body: body1, key: idemKey })
check('POST sync-jobs → 202', first.status === 202 && typeof data(first)?.job_id === 'string')
check('同键重放一致', replay.status === 202 && data(replay)?.job_id === data(first)?.job_id,
  `first=${data(first)?.job_id} replay=${data(replay)?.job_id}`)

const conflict = await call('POST', '/v1/sync-jobs', {
  body: { connection_id: 'other', product_ids: ['prod-002'] }, key: idemKey,
})
check('同键异体 → 409', conflict.status === 409 && errCode(conflict) === 'IDEMPOTENCY_CONFLICT',
  `status=${conflict.status} code=${errCode(conflict)}`)

const noKey = await fetch(`${BASE}/v1/sync-jobs`, {
  method: 'POST',
  headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify(body1),
})
check('缺 Idempotency-Key → 400', noKey.status === 400)

// ---- 5. 审计作业 ----
const audit = await call('POST', '/v1/audit-jobs', { body: { site_id: 'site-us', product_ids: ['prod-001'] } })
check('POST audit-jobs → 202', audit.status === 202 && typeof data(audit)?.job_id === 'string')

// ---- 6. 知识 / 问题 ----
const knowledge = await call('GET', '/v1/products/prod-001/knowledge')
check('GET product knowledge', knowledge.status === 200 && data(knowledge)?.product_id === 'prod-001'
  && Array.isArray(data(knowledge)?.facts))

const badStatus = await call('GET', '/v1/issues?status=bogus')
check('非法 status → 400', badStatus.status === 400)

const issues = await call('GET', '/v1/issues?status=open&limit=5')
check('GET issues（过滤+分页）', issues.status === 200 && Array.isArray(data(issues)?.items)
  && data(issues)?.limit === 5 && 'next_cursor' in data(issues))

const dismissed = await call('POST', '/v1/issues/issue-001/dismiss', {
  body: { reason: '误报', expected_version: 1 },
})
check('POST dismiss', dismissed.status === 200 && data(dismissed)?.status === 'dismissed')

const verified = await call('POST', '/v1/facts/fact-001/verify', {
  body: { public_use: true, note: 'ok' },
})
check('POST verify fact', verified.status === 200 && data(verified)?.status === 'verified')

// ---- 7. 变更集全流程 ----
const createBody = {
  entries: [{
    product_id: 'prod-001',
    target: { connection_id: 'cms-main', site_id: 'site-us', locale: 'en-US', market: 'US' },
    edits: [{ field_path: 'seo.title', proposed_value: 'New title', fact_refs: [] }],
  }],
}
const created = await call('POST', '/v1/change-sets', { body: createBody })
check('POST change-sets → 201', created.status === 201
  && typeof data(created)?.content_hash === 'string' && data(created)?.content_hash.length === 64,
  `hash=${data(created)?.content_hash?.slice(0, 12)}…`)
// v1.8：授权哈希 schema 版本随创建响应返回（v2 双基线）
check('创建响应含 hash_schema_version=2', data(created)?.hash_schema_version === 2)
const setId = data(created)?.id

const got = await call('GET', `/v1/change-sets/${setId}`)
// stub 语义：GET 哈希是无状态占位（sha256("stub-change-set:"+id)），与 POST 的真实冻结哈希
// 不同源；前端授权流程回显 GET 返回值（下方 authorize 用的是 got 的哈希），形状必须稳定。
check('GET change-set', got.status === 200 && typeof data(got)?.content_hash === 'string'
  && data(got)?.content_hash.length === 64)

const missing = await call('GET', '/v1/change-sets/missing')
check('GET 缺失资源 → 404', missing.status === 404 && errCode(missing) === 'RESOURCE_NOT_FOUND')

const authorized = await call('POST', `/v1/change-sets/${setId}/authorize`, {
  body: {
    content_hash: data(got)?.content_hash,
    expected_proposal_version: 1,
    confirmation_id: crypto.randomUUID(),
    reason: 'smoke',
  },
})
check('POST authorize → 201', authorized.status === 201 && typeof data(authorized)?.authorization_id === 'string')
const authId = data(authorized)?.authorization_id

const executed = await call('POST', `/v1/change-sets/${setId}/execute`, {
  body: { authorization_id: authId },
})
check('POST execute → 202', executed.status === 202 && typeof data(executed)?.execution_id === 'string')

const exec = await call('GET', `/v1/executions/${data(executed)?.execution_id}`)
check('GET execution', exec.status === 200 && Array.isArray(data(exec)?.items))

const restored = await call('POST', `/v1/executions/${data(executed)?.execution_id}/restore-proposals`, {
  body: { execution_item_ids: ['item-001'], reason: 'smoke' },
})
check('restore 缺 baseline → 400（v1.8）', restored.status === 400 && errCode(restored) === 'INVALID_REQUEST')

const restoredOk = await call('POST', `/v1/executions/${data(executed)?.execution_id}/restore-proposals`, {
  body: { execution_item_ids: ['item-001'], reason: 'smoke', baseline: 'published_baseline' },
})
check('restore published_baseline → 201', restoredOk.status === 201 && typeof data(restoredOk)?.change_set_id === 'string')

// ---- 8. 任务查询/取消 ----
const job = await call('GET', `/v1/jobs/${data(first)?.job_id}`)
check('GET job', job.status === 200 && data(job)?.id === data(first)?.job_id)
// v1.6 F02：详情带按类型聚合的 result；F09：恢复通过 retry_of 记录重试关系
check('job 详情含 result 聚合', typeof data(job)?.result?.kind === 'string'
  && Number.isInteger(data(job)?.result?.successful_items)
  && typeof data(job)?.result?.basis_revision === 'string')
// v1.8：终态判定收敛到 completion_reason
check('job result 含 completion_reason', typeof data(job)?.result?.completion_reason === 'string')

const cancelled = await call('POST', `/v1/jobs/${data(first)?.job_id}/cancel`, { body: { reason: 'smoke' } })
check('POST cancel → 202', cancelled.status === 202)

// ---- 9. v1.5 前端查询操作（20 §1） ----
const me = await call('GET', '/v1/me/capabilities')
check('GET me/capabilities', me.status === 200 && Array.isArray(data(me)?.permissions)
  && data(me)?.permissions?.includes('change.authorize'), `perms=${data(me)?.permissions?.length}`)

const overview = await call('GET', '/v1/overview')
check('GET overview（卡片+7天窗口）', overview.status === 200
  && Array.isArray(data(overview)?.cards) && !!data(overview)?.period_end)
// v1.6：卡片 key 收窄为枚举，不得出现 open_issues 等额外聚合
const cardKeys = (data(overview)?.cards ?? []).map((c) => c.key).join(',')
check('overview 卡片 key 为 v1.6 枚举', data(overview)?.cards?.every((c) =>
  ['action_required', 'running_jobs', 'verified_items'].includes(c.key)),
  `keys=${cardKeys}`)

const actionItems = await call('GET', '/v1/action-items?site_id=site-us&limit=5')
check('GET action-items', actionItems.status === 200 && Array.isArray(data(actionItems)?.items))

const products = await call('GET', '/v1/products?q=x&freshness=stale')
check('GET products（筛选）', products.status === 200 && Array.isArray(data(products)?.items))
const badFresh = await call('GET', '/v1/products?freshness=bogus')
check('products 非法 freshness → 400', badFresh.status === 400)

const product = await call('GET', '/v1/products/prod-001')
check('GET products/{id}', product.status === 200 && data(product)?.product?.id === 'prod-001')
// v1.6 F04：观测带比较状态；不可比必须给原因，禁止前端按文字判冲突
const obs = data(product)?.page_observations ?? []
check('观测含 comparison_status/conditions/mapping', obs.length > 0
  && obs.every((o) => ['ready', 'incomparable', 'not_checked'].includes(o.comparison_status)
    && !!o.conditions_id && !!o.mapping_version))

const sitesL = await call('GET', '/v1/sites')
check('GET sites', sitesL.status === 200)
const site = await call('GET', '/v1/sites/site-us')
check('GET sites/{id}', site.status === 200 && data(site)?.id === 'site-us')

const evidenceL = await call('GET', '/v1/evidence?product_id=prod-001')
check('GET evidence（product_id 筛选）', evidenceL.status === 200)
const evidence = await call('GET', '/v1/evidence/ev-1')
// v1.8：元数据层不返回摘录与内容哈希（语义向量 metadata_hash_leak）
check('GET evidence/{id}（metadata_only）', evidence.status === 200
  && data(evidence)?.can_view_excerpt === false
  && data(evidence)?.visibility === 'metadata_only'
  && data(evidence)?.source_hash === null)

const issueDetail = await call('GET', '/v1/issues/issue-001')
check('GET issues/{id}', issueDetail.status === 200 && data(issueDetail)?.id === 'issue-001')
const issueSev = await call('GET', '/v1/issues?severity=bogus')
check('issues 非法 severity → 400', issueSev.status === 400)
const issueSite = await call('GET', '/v1/issues?site_id=site-us&category=seo')
check('issues v1.5 筛选可用', issueSite.status === 200)

const setsL = await call('GET', '/v1/change-sets?status=draft')
check('GET change-sets 列表（v1.5 新增）', setsL.status === 200 && Array.isArray(data(setsL)?.items))
const badSet = await call('GET', '/v1/change-sets?status=bogus')
check('change-sets 非法 status → 400', badSet.status === 400)

const jobsL = await call('GET', '/v1/jobs?status=running&requires_attention=true&type=execute')
check('GET jobs 列表（筛选）', jobsL.status === 200)
const badJob = await call('GET', '/v1/jobs?status=bogus')
check('jobs 非法 status → 400', badJob.status === 400)

const notif = await call('GET', '/v1/notifications?unread_only=true')
check('GET notifications', notif.status === 200)
const notifBad = await call('GET', '/v1/notifications?unread_only=maybe')
check('notifications 非法 unread_only → 400', notifBad.status === 400)
const mark = await call('POST', '/v1/notifications/n-1/read')
check('POST notifications/{id}/read（幂等已读）', mark.status === 200 && !!data(mark)?.read_at)

const acts = await call('GET', '/v1/activity-events')
check('GET activity-events', acts.status === 200)

const viewerCaps = await call('GET', '/v1/me/capabilities', { headers: { Authorization: 'Bearer test-cred:acme:v:viewer' } })
check('viewer capabilities 含 v1.5 读权限', viewerCaps.status === 200
  && data(viewerCaps)?.permissions?.includes('workspace.read')
  && !data(viewerCaps)?.permissions?.includes('change.authorize'))

// ---- 汇总 ----
console.log(`\n${failures === 0 ? '✅ 全部通过' : `❌ ${failures} 项失败`}`)
process.exit(failures === 0 ? 0 : 1)

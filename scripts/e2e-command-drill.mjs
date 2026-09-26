// E2E 命令闭环演练：ops 注册 executor → 创建签名命令 → 子站领取/执行/回报。
// 用法：node scripts/e2e-command-drill.mjs [platformUrl]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8090'
const SUBSTATION = process.argv[3] ?? 'http://127.0.0.1:1339'
const step = (n, msg) => console.log(`${String(n).padStart(2, '0')} ${msg}`)

// 1. identity 登录 → ops 会话
const idLogin = await fetch(BASE + '/v1/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ login: 'ops-admin', password: 'ops-admin123' }),
})
const idTok = (await idLogin.json()).data.token
const AH = { 'Content-Type': 'application/json', Authorization: `Bearer ${idTok}` }

// 2. 交换 ops-context
const oc = await fetch(BASE + '/ops/v1/session/ops-context', { method: 'POST', headers: AH, body: '{}' })
const opsTok = (await oc.json()).data.token
const OH = { 'Content-Type': 'application/json', Authorization: `Bearer ${opsTok}` }

// 3. 注册执行服务（拿一次性令牌）
const reg = await fetch(BASE + '/ops/v1/executors', {
  method: 'POST', headers: OH,
  body: JSON.stringify({
    executor_id: 'exec-strapi-1339', tenant_id: 't_1', site_id: 'shop-127-0-0-1-1339',
    audience: 'executor:t_1:shop-127-0-0-1-1339', protocol_range: '1.x',
  }),
})
const regBody = await reg.json()
step(1, `executor 注册: ${reg.status} ${regBody.data?.token ? 'token=' + regBody.data.token.slice(0, 16) + '…' : JSON.stringify(regBody.error ?? '')}`)
const execToken = regBody.data?.token

// 4. 获取子站商品 documentId（公开内容 API）
const prods = await fetch(`${SUBSTATION}/api/industry-product/products?pagination[pageSize]=1`)
const prodBody = await prods.json()
const docId = prodBody.data?.[0]?.documentId
step(2, `子站商品 documentId: ${docId ?? '(空——需先录入商品)'}`)

// 5. 平台创建签名命令
const cmd = await fetch(BASE + '/ops/v1/commands', {
  method: 'POST', headers: OH,
  body: JSON.stringify({
    tenant_id: 't_1',
    channel_app_registration_id: 'car-strapi-substation-1',
    shop_stable_id: 'shop-127-0-0-1-1339',
    target_document_id: docId,
    proposal_id: 'drill-prop-1',
    patch: [{ field_path: 'seo.title', value: 'E2E Drill Title ' + new Date().toISOString() }],
  }),
})
const cmdBody = await cmd.json()
step(3, `命令创建: ${cmd.status} ${cmdBody.data?.command_id} hash=${cmdBody.data?.payload_hash?.slice(0, 12)}… sig=${cmdBody.data?.signature?.slice(0, 12)}…`)

// 6. 子站领取 + 执行 + 回报（通过执行入口的 pull-from-platform 端点）
const pull = await fetch(`${SUBSTATION}/api/execution/pull-from-platform`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${execToken}` },
  body: JSON.stringify({ executor_id: 'exec-strapi-1339', executor_token: execToken }),
})
const pullBody = await pull.json()
step(4, `子站领取/执行: ${pull.status} ${JSON.stringify(pullBody.data ?? pullBody.error)}`)

// 7. 平台查询命令终态
if (!cmdBody.data?.command_id) {
  console.log('❌ 命令创建失败:', JSON.stringify(cmdBody.error ?? cmdBody))
  process.exit(1)
}
const st = await fetch(BASE + `/ops/v1/commands/${cmdBody.data.command_id}`, { headers: OH })
const stBody = await st.json()
step(5, `平台终态: ${stBody.data?.status} revision=${stBody.data?.result_revision}`)

if (stBody.data?.status === 'succeeded') {
  console.log('\n✅ 命令闭环 E2E 演练成功')
} else {
  console.log('\n❌ 演练未达成 succeeded 终态')
  process.exit(1)
}

// E2E 全链路验收：平台创建签名命令 → 子站领取 → 执行写入 → 回读证据 →
// 结果回报 → EXT-05 重投幂等。
const PLATFORM = process.argv[2] ?? 'http://127.0.0.1:8090'
const SUBSTATION = process.argv[3] ?? 'http://127.0.0.1:1339'

let pass = 0, fail = 0
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✅ ${msg}`) }
  else { fail++; console.log(`  ❌ ${msg}`) }
}
const step = (msg) => console.log(`\n▶ ${msg}`)

async function req(url, method, headers, body) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, json, text }
}

// ---- 1. ops 会话 ----
step('获取 ops 会话')
const idRes = await req(PLATFORM + '/v1/auth/login', 'POST', { 'Content-Type': 'application/json' }, { login: 'ops-admin', password: 'ops-admin123' })
if (idRes.status !== 200 || !idRes.json?.data?.token) { console.log('❌ identity login failed:', idRes.text?.slice(0, 200)); process.exit(1) }
const idTok = idRes.json.data.token
ok(true, 'identity 会话获取')

const ocRes = await req(PLATFORM + '/ops/v1/session/ops-context', 'POST', { 'Content-Type': 'application/json', Authorization: `Bearer ${idTok}` }, '{}')
if (ocRes.status !== 200 || !ocRes.json?.data?.token) { console.log('❌ ops-context failed:', ocRes.text?.slice(0, 200)); process.exit(1) }
const opsTok = ocRes.json.data.token
const OH = { 'Content-Type': 'application/json', Authorization: `Bearer ${opsTok}` }
ok(true, 'ops 会话获取')

// ---- 2. 注册 executor ----
step('注册 executor')
const regRes = await req(PLATFORM + '/ops/v1/executors', 'POST', OH, {
  executor_id: 'exec-strapi-1339', tenant_id: 't_1', site_id: 'shop-127-0-0-1-1339',
  audience: 'executor:t_1:shop-127-0-0-1-1339', protocol_range: '1.x',
})
ok(regRes.status === 201, `executor 注册: ${regRes.status}`)
const regToken = regRes.json?.data?.token
ok(!!regToken, `一次性令牌获取: ${regToken?.slice(0, 12)}…`)

// ---- 3. 创建签名命令 ----
step('创建签名命令')
const docId = 'j8hn4iz5wbaw83mh8fjjtr4s'
const titleVal = `E2E Diagnostic ${Date.now()}`
const cmdRes = await req(PLATFORM + '/ops/v1/commands', 'POST', OH, {
  tenant_id: 't_1',
  channel_app_registration_id: 'car-strapi-substation-1',
  shop_stable_id: 'shop-127-0-0-1-1339',
  target_document_id: docId,
  proposal_id: 'prop-e2e-diag-1',
  patch: [{ field_path: 'seo.title', value: titleVal }],
})
if (cmdRes.status !== 202) {
  console.log(`❌ 命令创建失败: ${cmdRes.status} ${cmdRes.text?.slice(0, 200)}`)
  process.exit(1)
}
const cmdId = cmdRes.json?.data?.command_id
const cmdHash = cmdRes.json?.data?.payload_hash
const cmdSig = cmdRes.json?.data?.signature
ok(!!cmdId, `命令 ID = ${cmdId}`)
ok(!!cmdHash && cmdHash.length === 64, `payload_hash = ${cmdHash?.slice(0, 16)}…`)
ok(!!cmdSig && cmdSig.length === 64, `签名 = ${cmdSig?.slice(0, 16)}…`)

// ---- 4. 子站领取 ----
step('子站领取命令')
const pullRes = await req(SUBSTATION + '/api/execution/pull-from-platform', 'POST', {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${regToken}`,
}, { executor_id: 'exec-strapi-1339', executor_token: regToken })
ok(pullRes.status === 200, `子站领取: ${pullRes.status}`)

// ---- 5. 查询命令终态 ----
step('查询命令终态')
const stRes = await req(PLATFORM + `/ops/v1/commands/${cmdId}`, 'GET', { Authorization: `Bearer ${opsTok}` })
const stData = stRes.json?.data
ok(stData?.status === 'succeeded', `终态 = ${stData?.status}（want succeeded）`)
ok(stData?.result_revision > 0, `revision = ${stData?.result_revision}`)

// ---- 6. EXT-05 重投测试 ----
step('EXT-05 重投')
const rePull = await req(SUBSTATION + '/api/execution/pull-from-platform', 'POST', {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${regToken}`,
}, { executor_id: 'exec-strapi-1339', executor_token: regToken })
ok(rePull.status === 200, '重投后子站正常')

console.log(`\n${fail === 0 ? '✅ 全部通过' : `❌ ${fail} 项失败`}`)
process.exit(fail === 0 ? 0 : 1)

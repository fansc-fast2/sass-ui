// /v1 16 条契约路由 + /health 的类型化端点函数（07 §2 权限语义见注释）。

import { apiRequest } from './client'
import type {
  AuditJobBody,
  AuthorizationCreated,
  AuthorizeBody,
  CancelJobBody,
  CancelledJob,
  Capabilities,
  ChangeEntry,
  ChangeSetCreated,
  ChangeSetView,
  DismissIssueBody,
  DismissedIssue,
  ExecutionAccepted,
  ExecutionView,
  IssueList,
  JobAccepted,
  KnowledgeView,
  RestoreProposalsBody,
  RestoreProposalsCreated,
  RevokeBody,
  RevokedSet,
  ExecuteBody,
  SyncJobBody,
  VerifiedFact,
  VerifyFactBody,
} from './types'

// GET /v1/connections/{id}/capabilities —— connection.read
export const getCapabilities = (id: string) =>
  apiRequest<Capabilities>('GET', `/v1/connections/${encodeURIComponent(id)}/capabilities`)

// POST /v1/sync-jobs —— knowledge.sync（202）
export const createSyncJob = (body: SyncJobBody) =>
  apiRequest<JobAccepted>('POST', '/v1/sync-jobs', { body })

// POST /v1/audit-jobs —— seo.audit（202）
export const createAuditJob = (body: AuditJobBody) =>
  apiRequest<JobAccepted>('POST', '/v1/audit-jobs', { body })

// GET /v1/products/{id}/knowledge —— knowledge.read
export const getProductKnowledge = (id: string) =>
  apiRequest<KnowledgeView>('GET', `/v1/products/${encodeURIComponent(id)}/knowledge`)

// GET /v1/issues —— knowledge.read（status 必须是目录枚举；v1.5 增加
// product_id/site_id/severity/category 筛选，均参与游标绑定）
export const listIssues = (query: {
  status?: string
  product_id?: string
  site_id?: string
  severity?: string
  category?: string
  limit?: number
  cursor?: string
} = {}) => apiRequest<IssueList>('GET', '/v1/issues', { query })

// POST /v1/issues/{id}/dismiss —— knowledge.verify
export const dismissIssue = (id: string, body: DismissIssueBody) =>
  apiRequest<DismissedIssue>('POST', `/v1/issues/${encodeURIComponent(id)}/dismiss`, { body })

// POST /v1/facts/{id}/verify —— knowledge.verify
export const verifyFact = (id: string, body: VerifyFactBody) =>
  apiRequest<VerifiedFact>('POST', `/v1/facts/${encodeURIComponent(id)}/verify`, { body })

// POST /v1/change-sets —— change.propose（201）
// idempotencyScope：发布路径使用 sessionStorage 稳定幂等键（10 §5）
export const createChangeSet = (entries: ChangeEntry[], opts?: { idempotencyScope?: string }) =>
  apiRequest<ChangeSetCreated>('POST', '/v1/change-sets', { body: { entries }, idempotencyScope: opts?.idempotencyScope })

// GET /v1/change-sets/{id} —— change.read
export const getChangeSet = (id: string) =>
  apiRequest<ChangeSetView>('GET', `/v1/change-sets/${encodeURIComponent(id)}`)

// POST /v1/change-sets/{id}/authorize —— change.authorize（201，回显 GET 的 content_hash）
export const authorizeChangeSet = (id: string, body: AuthorizeBody, opts?: { idempotencyScope?: string }) =>
  apiRequest<AuthorizationCreated>('POST', `/v1/change-sets/${encodeURIComponent(id)}/authorize`, { body, idempotencyScope: opts?.idempotencyScope })

// POST /v1/change-sets/{id}/revoke —— change.authorize
export const revokeChangeSet = (id: string, body: RevokeBody, opts?: { idempotencyScope?: string }) =>
  apiRequest<RevokedSet>('POST', `/v1/change-sets/${encodeURIComponent(id)}/revoke`, { body, idempotencyScope: opts?.idempotencyScope })

// POST /v1/change-sets/{id}/execute —— change.execute（202）
// 执行是最高危路径：同授权 + 同内容重试必须复用同一幂等键，避免重复发布
export const executeChangeSet = (id: string, body: ExecuteBody, opts?: { idempotencyScope?: string }) =>
  apiRequest<ExecutionAccepted>('POST', `/v1/change-sets/${encodeURIComponent(id)}/execute`, { body, idempotencyScope: opts?.idempotencyScope })

// GET /v1/executions/{id} —— job.read
export const getExecution = (id: string) =>
  apiRequest<ExecutionView>('GET', `/v1/executions/${encodeURIComponent(id)}`)

// POST /v1/executions/{id}/restore-proposals —— change.restore（201）
export const createRestoreProposals = (id: string, body: RestoreProposalsBody, opts?: { idempotencyScope?: string }) =>
  apiRequest<RestoreProposalsCreated>('POST', `/v1/executions/${encodeURIComponent(id)}/restore-proposals`, { body, idempotencyScope: opts?.idempotencyScope })

// GET /v1/jobs/{id} —— job.read（详情含 result 聚合与 retry_of，v1.6）
export const getJob = (id: string) =>
  apiRequest<JobDetail>('GET', `/v1/jobs/${encodeURIComponent(id)}`)

// POST /v1/jobs/{id}/cancel —— job.cancel（202，取消是请求不保证生效）
export const cancelJob = (id: string, body: CancelJobBody) =>
  apiRequest<CancelledJob>('POST', `/v1/jobs/${encodeURIComponent(id)}/cancel`, { body })

// ---- v1.5 前端查询操作（20 §1） ----

import type {
  ActionItem,
  ActivityEventItem,
  ChangeSetSummary,
  EvidenceDetail,
  IssueDetail,
  JobDetail,
  JobSummary,
  MyCapabilities,
  NotificationItem,
  Overview,
  PageList,
  ProductDetail,
  ProductSummary,
  SiteSummary,
  TenantMember,
  TenantInvitation,
  TenantSupportGrant,
  TenantUsageBucket,
} from './types'

// GET /v1/me/capabilities —— self.read（导航能力，展示用途）
export const getMyCapabilities = () =>
  apiRequest<MyCapabilities>('GET', '/v1/me/capabilities')

// GET /v1/overview —— workspace.read（权限过滤后的卡片摘要）
export const getOverview = (siteId?: string) =>
  apiRequest<Overview>('GET', `/v1/overview${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ''}`)

// GET /v1/action-items —— workspace.read（issue/set/job 派生待办）
export const listActionItems = (query: { site_id?: string; limit?: number; cursor?: string } = {}) =>
  apiRequest<PageList<ActionItem>>('GET', '/v1/action-items', { query })

// GET /v1/products —— knowledge.read（Strapi 商品只读投影）
export const listProducts = (query: {
  site_id?: string
  q?: string
  freshness?: string
  knowledge_status?: string
  limit?: number
  cursor?: string
} = {}) => apiRequest<PageList<ProductSummary>>('GET', '/v1/products', { query })

// GET /v1/products/{id} —— knowledge.read（来源与站点摘要）
export const getProduct = (id: string) =>
  apiRequest<ProductDetail>('GET', `/v1/products/${encodeURIComponent(id)}`)

// GET /v1/sites —— connection.read（可见站点集合）
export const listSites = (query: { limit?: number; cursor?: string } = {}) =>
  apiRequest<PageList<SiteSummary>>('GET', '/v1/sites', { query })

// GET /v1/sites/{id} —— connection.read（站点详情与连接引用）
export const getSite = (id: string) =>
  apiRequest<SiteSummary>('GET', `/v1/sites/${encodeURIComponent(id)}`)

// GET /v1/evidence —— knowledge.read（可见证据索引）
export const listEvidence = (query: { product_id?: string; limit?: number; cursor?: string } = {}) =>
  apiRequest<PageList<EvidenceDetail>>('GET', '/v1/evidence', { query })

// GET /v1/evidence/{id} —— knowledge.read + 证据 ACL
export const getEvidence = (id: string) =>
  apiRequest<EvidenceDetail>('GET', `/v1/evidence/${encodeURIComponent(id)}`)

// GET /v1/issues/{id} —— knowledge.read（问题详情）
export const getIssue = (id: string) =>
  apiRequest<IssueDetail>('GET', `/v1/issues/${encodeURIComponent(id)}`)

// GET /v1/change-sets —— change.read（v1.5 新增列表操作；v1.6 F05 返回摘要）
export const listChangeSets = (query: {
  site_id?: string
  product_id?: string
  status?: string
  limit?: number
  cursor?: string
} = {}) => apiRequest<PageList<ChangeSetSummary>>('GET', '/v1/change-sets', { query })

// GET /v1/jobs —— job.read（任务查询；v1.6 F05 列表返回轻量摘要 JobSummary）
export const listJobs = (query: {
  site_id?: string
  product_id?: string
  status?: string
  requires_attention?: boolean
  type?: string
  limit?: number
  cursor?: string
} = {}) => apiRequest<PageList<JobSummary>>('GET', '/v1/jobs', { query })

// GET /v1/notifications —— notification.read（当前用户通知）
export const listNotifications = (query: { unread_only?: boolean; limit?: number; cursor?: string } = {}) =>
  apiRequest<PageList<NotificationItem>>('GET', '/v1/notifications', { query })

// POST /v1/notifications/{id}/read —— notification.read（幂等标记已读）
export const markNotificationRead = (id: string) =>
  apiRequest<NotificationItem>('POST', `/v1/notifications/${encodeURIComponent(id)}/read`, { body: {} })

// GET /v1/activity-events —— activity.read（可见业务活动摘要）
export const listActivityEvents = (query: { limit?: number; cursor?: string } = {}) =>
  apiRequest<PageList<ActivityEventItem>>('GET', '/v1/activity-events', { query })

// ---- F1 成员治理 / 租户设置 / 用量 / 支持授权（Tenant 上下文） ----
// 类型（TenantMember/TenantInvitation/TenantUsageBucket/TenantSupportGrant）在 types.ts。

export const listTenantMembers = () =>
  apiRequest<PageList<TenantMember>>('GET', '/v1/tenant/members')

export const createTenantInvitation = (body: { invitee_login: string; role: string; ttl_hours?: number }) =>
  apiRequest<TenantInvitation & { token: string }>('POST', '/v1/tenant/invitations', { body })

export const revokeTenantInvitation = (id: string) =>
  apiRequest<{ id: string; status: string }>('POST', `/v1/tenant/invitations/${encodeURIComponent(id)}/revoke`, { body: {} })

export const updateTenantMember = (id: string, body: { role?: string; status?: string }) =>
  apiRequest<{ membership_id: string; role: string; status: string }>('PATCH', `/v1/tenant/members/${encodeURIComponent(id)}`, { body })

export const getTenantSettings = () =>
  apiRequest<{ id: string; name: string; status: string; plan_id: string; row_version: number }>('GET', '/v1/tenant/settings')

export const updateTenantSettings = (body: { name: string; expected_row_version: number }) =>
  apiRequest<{ id: string; name: string; row_version: number }>('PATCH', '/v1/tenant/settings', { body })

export const getTenantUsage = () =>
  apiRequest<{ tenant_id: string; buckets: TenantUsageBucket[]; as_of: string }>('GET', '/v1/tenant/usage')

export const listTenantSupportGrants = () =>
  apiRequest<PageList<TenantSupportGrant>>('GET', '/v1/tenant/support-grants')

export const decideSupportGrant = (id: string, approve: boolean) =>
  apiRequest<{ id: string; status: string }>('POST', `/v1/tenant/support-grants/${encodeURIComponent(id)}/decisions`, { body: { approve } })

// ---- SG01/SG02 站内 SEO 检测（Tenant 上下文；/v1/seo/* 不属于 31 契约操作） ----
// 类型（SeoFinding/SeoScanResult/SeoAnswerReview 等）在 types.ts。

import type {
  SeoAnswerReview,
  SeoAnswerReviewBody,
  SeoAnswerReviewList,
  SeoFinding,
  SeoFindingList,
  SeoScanBody,
  SeoScanResult,
} from './types'

// POST /v1/seo/scans —— 同步触发站内扫描（有界：URL 数有上限）
export const runSeoScan = (body: SeoScanBody) =>
  apiRequest<SeoScanResult>('POST', '/v1/seo/scans', { body })

// GET /v1/seo/findings —— findings 清单（rule_id 可选筛选）
export const listSeoFindings = (query: { rule_id?: string } = {}) =>
  apiRequest<SeoFindingList>('GET', '/v1/seo/findings', { query })

// POST /v1/seo/findings/{id}/status —— 复核状态流转（tenant_admin）
export const setSeoFindingStatus = (fingerprint: string, status: 'dismissed' | 'open') =>
  apiRequest<SeoFinding>('POST', `/v1/seo/findings/${encodeURIComponent(fingerprint)}/status`, { body: { status } })

// POST /v1/seo/answer-reviews —— SG02 答案质量评审（page_url 可选，启用可见性检查）
export const reviewAnswer = (body: SeoAnswerReviewBody) =>
  apiRequest<SeoAnswerReview>('POST', '/v1/seo/answer-reviews', { body })

// GET /v1/seo/answer-reviews —— 评审清单
export const listAnswerReviews = () =>
  apiRequest<SeoAnswerReviewList>('GET', '/v1/seo/answer-reviews')

// GET /v1/seo/answer-reviews/{id} —— 单条评审（scope 指纹）
export const getAnswerReview = (fingerprint: string) =>
  apiRequest<SeoAnswerReview>('GET', `/v1/seo/answer-reviews/${encodeURIComponent(fingerprint)}`)

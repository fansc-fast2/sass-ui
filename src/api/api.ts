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
export const createChangeSet = (entries: ChangeEntry[]) =>
  apiRequest<ChangeSetCreated>('POST', '/v1/change-sets', { body: { entries } })

// GET /v1/change-sets/{id} —— change.read
export const getChangeSet = (id: string) =>
  apiRequest<ChangeSetView>('GET', `/v1/change-sets/${encodeURIComponent(id)}`)

// POST /v1/change-sets/{id}/authorize —— change.authorize（201，回显 GET 的 content_hash）
export const authorizeChangeSet = (id: string, body: AuthorizeBody) =>
  apiRequest<AuthorizationCreated>('POST', `/v1/change-sets/${encodeURIComponent(id)}/authorize`, { body })

// POST /v1/change-sets/{id}/revoke —— change.authorize
export const revokeChangeSet = (id: string, body: RevokeBody) =>
  apiRequest<RevokedSet>('POST', `/v1/change-sets/${encodeURIComponent(id)}/revoke`, { body })

// POST /v1/change-sets/{id}/execute —— change.execute（202）
export const executeChangeSet = (id: string, body: ExecuteBody) =>
  apiRequest<ExecutionAccepted>('POST', `/v1/change-sets/${encodeURIComponent(id)}/execute`, { body })

// GET /v1/executions/{id} —— job.read
export const getExecution = (id: string) =>
  apiRequest<ExecutionView>('GET', `/v1/executions/${encodeURIComponent(id)}`)

// POST /v1/executions/{id}/restore-proposals —— change.restore（201）
export const createRestoreProposals = (id: string, body: RestoreProposalsBody) =>
  apiRequest<RestoreProposalsCreated>('POST', `/v1/executions/${encodeURIComponent(id)}/restore-proposals`, { body })

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

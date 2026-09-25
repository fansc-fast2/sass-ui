// 与 platform-backend（Go）/v1 契约对应的 DTO 类型。
// 形状以 docs/product-knowledge-devkit-v1.4/contracts/openapi.json 与
// internal/transport 的 stub 处理器为准（信封 {request_id, data}）。

export interface Envelope<T> {
  request_id: string
  data: T
}

export interface ApiErrorPayload {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

// ---- 各端点响应 ----

export interface Capabilities {
  connection_id: string
  management_mode: string
}

export interface JobAccepted {
  job_id: string
  status: string
}

export interface JobView {
  id: string
  status: string
}

export interface KnowledgeView {
  product_id: string
  facts: unknown[]
}

export interface IssueList {
  items: unknown[]
  next_cursor: string | null
  limit: number
}

export interface DismissedIssue {
  id: string
  status: string
}

export interface VerifiedFact {
  id: string
  status: string
}

export interface ChangeSetCreated {
  id: string
  status: string
  content_hash: string
  proposal_version: number
  item_count: number
}

export interface ChangeSetView {
  id: string
  status: string
  content_hash: string
  /** v1.8：授权哈希 schema 版本（v2 双基线）；v1 授权不得重用 */
  hash_schema_version?: number
  items: unknown[]
}

export interface AuthorizationCreated {
  authorization_id: string
  set_id: string
  grant_type: string
}

export interface RevokedSet {
  id: string
  status: string
}

export interface ExecutionAccepted {
  execution_id: string
  job_id: string
  status: string
}

export interface ExecutionView {
  id: string
  items: unknown[]
}

export interface RestoreProposalsCreated {
  change_set_id: string
  status: string
}

export interface CancelledJob {
  job_id: string
  status: string
}

// ---- 请求体 ----

export interface FactRef {
  id: string
  version: number
}

export interface Edit {
  field_path: string
  proposed_value: string
  asset_id?: string
  fact_refs: FactRef[]
}

export interface Target {
  connection_id: string
  site_id: string
  locale: string
  market: string
  variant_id?: string
}

export interface ChangeEntry {
  product_id: string
  target: Target
  edits: Edit[]
}

export interface SyncJobBody {
  connection_id: string
  product_ids: string[]
}

export interface AuditJobBody {
  site_id: string
  product_ids: string[]
}

export interface DismissIssueBody {
  reason: string
  expected_version: number
}

export interface VerifyFactBody {
  public_use: boolean
  note: string
}

export interface AuthorizeBody {
  content_hash: string
  expected_proposal_version: number
  confirmation_id: string
  reason: string
}

export interface RevokeBody {
  reason: string
}

export interface ExecuteBody {
  authorization_id: string
}

export interface RestoreProposalsBody {
  execution_item_ids: string[]
  reason: string
  /** v1.8（06 §10）：恢复基线固定为已发布基线，必填；恢复产物是新提案。 */
  baseline: 'published_baseline'
}

export interface CancelJobBody {
  reason: string
}

// ---- v1.5 前端查询读模型（20 §1/§3，contracts/openapi.json） ----

export type JobStatusValue = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled'
export type IssueSeverityValue = 'info' | 'warning' | 'blocker'
export type FreshnessValue = 'current' | 'stale' | 'unknown'

export interface ResourceLink {
  kind: string
  id: string
}

export interface MyCapabilities {
  actor_id: string
  permission_version: string
  permissions: string[]
  site_ids: string[]
  features: Record<string, unknown>
}

export interface OverviewCard {
  key: 'action_required' | 'running_jobs' | 'verified_items'
  status: string
  value: number | null
  unit: 'items' | 'jobs'
  as_of: string | null
}

export interface Overview {
  observed_at: string
  coverage: string
  cards: OverviewCard[]
  site_id: string
  period_start: string
  period_end: string
}

export interface ActionItem {
  id: string
  source: ResourceLink
  action_kind: string
  title: string
  priority: string
  created_at: string
  due_at: string | null
}

export interface ProductSummary {
  id: string
  name: string
  model: string | null
  connection_id: string
  site_ids: string[]
  source_updated_at: string
  synced_at: string
  freshness: FreshnessValue
  knowledge_status: string
  visible_issue_count: number
  thumbnail_url?: string
}

export interface FieldObservation {
  field_path: string
  display_value: string | null
  value_state: 'known' | 'unknown' | 'not_applicable'
  variant_id: string | null
  market: string | null
  locale: string | null
  observed_at: string
  source_revision: string | null
  site_id: string | null
  /** v1.6 F04：比较维度（属性键/条件/映射版本），缺一即 incomparable */
  attribute_key?: string | null
  conditions_id?: string | null
  mapping_version?: string | null
  unit?: string | null
  comparison_status: 'ready' | 'incomparable' | 'not_checked'
  comparison_reason?: string | null
}

export interface ProductDetail {
  product: ProductSummary
  source_revision: string
  cms_view_url: string | null
  variant_ids: string[]
  source_fields: FieldObservation[]
  page_observations: FieldObservation[]
}

export interface SiteSummary {
  id: string
  name: string
  public_host: string
  locales: string[]
  markets: string[]
  connection_ids: string[]
  status: 'active' | 'read_only' | 'disconnected' | 'suspended'
  last_synced_at: string | null
}

export interface EvidenceDetail {
  id: string
  product_id: string
  source_version: string
  access: 'internal' | 'public' | 'restricted'
  public_disclosure: 'prohibited' | 'needs_confirmation' | 'approved'
  excerpt: string | null
  can_view_excerpt: boolean
  source_hash: string | null
  observed_at: string
  /** v1.8：证据可见性分层——metadata_only 不得携带摘录或内容哈希 */
  visibility: 'metadata_only' | 'content'
}

export interface IssueDetail {
  id: string
  version: number
  product_id: string
  rule_id: string
  severity: IssueSeverityValue
  status: string
  message: string
  evidence_ids: string[]
  detected_at: string
  category?: string
  site_id?: string
  field_path?: string
  expected?: string
  observed?: string
  recommendation?: string
  change_set_ids?: string[]
}

export interface JobItem {
  id: string
  type: string
  status: JobStatusValue
  execution_id?: string
  completed_items: number
  total_items: number
  requires_attention: boolean
  attention_reason?: string
  cancel_requested: boolean
  side_effect_summary: string
  created_at: string
  updated_at: string
}

// v1.6 F05：列表返回轻量摘要（JobSummary），详情才带 result。
export interface JobSummary extends JobItem {
}

// v1.6 F02：result 按任务类型聚合分项（issues_found 仅 audit 有意义）。
export interface JobResult {
  kind: 'sync' | 'audit' | 'execute'
  as_of: string
  basis_revision: string
  successful_items: number
  failed_items: number
  cancelled_items: number
  skipped_items: number
  issues_found: number | null
  /** v1.8：终态判定收敛到完成原因（v1.7 终态优先级） */
  completion_reason?: 'completed' | 'partial_failure' | 'no_applicable_targets' | 'all_cancelled' | 'all_failed'
}

export interface JobDetail extends JobItem {
  result: JobResult
  /** v1.6 F09：重试关系；恢复始终生成新提案，原终态历史不原位重跑 */
  retry_of?: string | null
}

export interface NotificationItem {
  id: string
  source: ResourceLink
  title: string
  created_at: string
  read_at: string | null
}

export interface ActivityEventItem {
  id: string
  source: ResourceLink
  action: string
  summary: string
  occurred_at: string
}

// 分页信封：所有 v1.5+ 列表共用 { items, next_cursor }。
export interface PageList<T> {
  items: T[]
  next_cursor: string | null
}

// v1.6 F05：提案列表返回摘要（含 product_ids/site_ids/created_at/expires_at）。
export interface ChangeSetSummary {
  id: string
  status: string
  proposal_version: number
  content_hash: string
  item_count: number
  product_ids: string[]
  site_ids: string[]
  created_at: string
  expires_at: string | null
}

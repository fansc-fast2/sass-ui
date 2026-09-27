// 统一数据表（SaaS 化改造）：列头排序、行 hover、单元格截断 + title、
// 加载/空/错误三态（复用 ListState 语义）、行数与分页说明（"第 x–y 条，共 n 条"）。
// 只做展示编排，不改变页面的取数逻辑（游标分页由页面自行触发，通过 footerExtra 伸出入口）。

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ErrorBanner, EmptyState, Loading } from './ui'
import { IconChevronDown, IconChevronUp, IconChevronLeft, IconChevronRight, IconSort } from './icons'

export interface Column<T> {
  /** 列标识（同时作为排序键） */
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** 提供后该列可排序 */
  sortValue?: (row: T) => string | number
  /** 初始排序是否按数值比较（默认自动：全部 number 用数值，否则按字符串） */
  align?: 'left' | 'right'
  /** 截断显示（超宽省略），title 提示完整内容 */
  ellipsis?: number
  /** 截断时 title 的取值；缺省用 sortValue 或 render 结果不适用 */
  titleOf?: (row: T) => string
  width?: number | string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  /** 行点击（如进入详情）；提供后行有 pointer 与无障碍按钮语义说明 */
  onRowClick?: (row: T) => void
  // 三态
  loading?: boolean
  error?: unknown
  /** 空态文案（须给下一步动作，不用感叹号） */
  empty?: ReactNode
  emptyAction?: ReactNode
  /** 空态补充说明 */
  emptyHint?: ReactNode
  /** 服务端总数（游标分页时传总数或 undefined；缺省用 rows.length） */
  total?: number
  /** 客户端分页大小；不传则不分页 */
  pageSize?: number
  /** 表格脚注右侧插槽（下一页按钮等） */
  footerExtra?: ReactNode
  /** 初始排序列 key */
  initialSortKey?: string
  /** 初始排序方向 */
  initialSortDir?: 'asc' | 'desc'
  /** 隐藏脚注（小表） */
  noFooter?: boolean
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'zh-CN')
}

export function DataTable<T>({ columns, rows, getRowKey, onRowClick, loading, error, empty, emptyAction, emptyHint, total, pageSize, footerExtra, initialSortKey, initialSortDir = 'asc', noFooter }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(
    initialSortKey ? { key: initialSortKey, dir: initialSortDir } : null,
  )
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const cmp = compareValues(col.sortValue!(a), col.sortValue!(b))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sort, columns])

  const effectivePageSize = pageSize ?? sorted.length
  const pageCount = Math.max(1, Math.ceil(sorted.length / effectivePageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visible = pageSize ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted
  const totalCount = total ?? rows.length

  const toggleSort = (key: string) => {
    setPage(0)
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  if (error) return <ErrorBanner error={error} />
  if (loading) return <Loading text="加载中…" />
  if (rows.length === 0) {
    return (
      <EmptyState
        text={empty}
        hint={emptyHint}
        action={emptyAction}
      />
    )
  }

  const rangeStart = safePage * effectivePageSize + 1
  const rangeEnd = safePage * effectivePageSize + visible.length

  return (
    <div className="datatable">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => {
                const isSorted = sort?.key === c.key
                const sortable = Boolean(c.sortValue)
                return (
                  <th
                    key={c.key}
                    style={c.width !== undefined ? { width: c.width } : undefined}
                    aria-sort={isSorted ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className={`th-sort ${isSorted ? 'th-sorted' : ''}`}
                        onClick={() => toggleSort(c.key)}
                        title={`按「${typeof c.header === 'string' ? c.header : c.key}」排序`}
                      >
                        {c.header}
                        {isSorted
                          ? (sort!.dir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />)
                          : <IconSort size={12} className="th-sort-hint" />}
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={getRowKey(row)}
                className={onRowClick ? 'row-clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => {
                  const title = c.titleOf?.(row)
                  return (
                    <td
                      key={c.key}
                      className={c.ellipsis ? 'td-ellipsis' : undefined}
                      style={{
                        ...(c.ellipsis ? { maxWidth: c.ellipsis } : {}),
                        ...(c.align === 'right' ? { textAlign: 'right' } : {}),
                      }}
                      title={title}
                    >
                      {c.render(row)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!noFooter && (
        <div className="table-foot">
          <span className="muted">第 {rangeStart}–{rangeEnd} 条，共 {totalCount} 条</span>
          <div className="table-foot-right">
            {pageSize && pageCount > 1 && (
              <span className="pager">
                <button type="button" className="btn btn-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="上一页">
                  <IconChevronLeft size={12} /> 上一页
                </button>
                <span className="muted">第 {safePage + 1} / {pageCount} 页</span>
                <button type="button" className="btn btn-xs" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="下一页">
                  下一页 <IconChevronRight size={12} />
                </button>
              </span>
            )}
            {footerExtra}
          </div>
        </div>
      )}
    </div>
  )
}

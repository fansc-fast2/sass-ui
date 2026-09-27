// AI 工作区（/ai）：独立工作区按阶段接入（19 §4）。
// 未接通时显示能力未接通说明和可用的只读入口，不生成伪聊天响应。

import { ActionCard, Card, Badge } from '../components/ui'
import { IconProducts, IconSearch } from '../components/icons'
import { useAppState } from '../state/AppStateContext'

export function AiWorkspacePage() {
  const { navigate } = useAppState()
  return (
    <div className="page">
      <Card
        title="AI 工作区未接通"
        subtitle="独立 AI 工作区与控制层会话对接，不在本服务新建会话库（19 §1/§5）"
      >
        <p>
          <Badge tone="warn">能力未接通</Badge> 当前阶段没有可用的 AI 会话入口，因此这里不提供模拟对话。
          你可以先用下面的只读入口完成检查与处理，AI 生成候选的能力接入后此页会自动提供对象上下文发起入口。
        </p>
        <div className="action-grid two">
          <ActionCard icon={<IconProducts size={22} />} title="商品与知识" desc="浏览商品知识与证据（只读）" onClick={() => navigate('products')} />
          <ActionCard icon={<IconSearch size={22} />} title="优化中心" desc="处理问题与提案（只读+确认动作）" onClick={() => navigate('optimization')} />
        </div>
      </Card>
    </div>
  )
}

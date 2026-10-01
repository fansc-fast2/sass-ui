// AI 工作区（/ai）：独立工作区按阶段接入（19 §4）。
// 未接通时显示能力未接通说明和可用的只读入口，不生成伪聊天响应。

import { ActionCard, Badge, Card } from '../components/ui'
import { IconProducts, IconSearch } from '../components/icons'
import { useLang } from '../i18n'
import { useAppState } from '../state/AppStateContext'

export function AiWorkspacePage() {
  const { t } = useLang()
  const { navigate } = useAppState()
  return (
    <div className="page">
      <Card
        title={t('aiNotConnected')}
        subtitle={t('aiNotConnectedSub')}
      >
        <p>
          <Badge tone="warn">{t('aiBadge')}</Badge> {t('aiBody')}
        </p>
        <div className="action-grid two">
          <ActionCard icon={<IconProducts size={22} />} title={t('navGroupProducts')} desc={t('aiActionProductsDesc')} onClick={() => navigate('products')} />
          <ActionCard icon={<IconSearch size={22} />} title={t('navGroupOptimization')} desc={t('aiActionOptDesc')} onClick={() => navigate('optimization')} />
        </div>
      </Card>
    </div>
  )
}

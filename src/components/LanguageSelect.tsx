// 语言切换控件（中/英）：租户面顶栏、设置页与 /ops 运营面共用。
// 切换即时生效（Context 重渲染），选择持久化在 localStorage（pc-lang）。

import { useLang } from '../i18n'
import type { Lang } from '../i18n'
import { Select } from './ui'

export function LanguageSelect({ compact }: { compact?: boolean }) {
  const { lang, setLang, t } = useLang()
  const ariaLabel = t('langLabel')
  return (
    <Select
      className="lang-select"
      style={compact ? { width: 110 } : undefined}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <option value="zh">{t('langOptionZh')}</option>
      <option value="en">{t('langOptionEn')}</option>
    </Select>
  )
}

// 自研轻量 i18n 内核（无第三方依赖）：LangProvider + useLang()。
// 双 shell（租户面 App 与 /ops 运营面）在 main.tsx 统一包一层 LangProvider。
// - 字典：zh.ts（key 来源）与 en.ts（Record<MsgKey, string>，缺 key 编译报错）
// - 持久化：localStorage 'pc-lang'，未设置时默认 zh
// - t(key, params?) 支持 {name} 插值
// 切换语言即时生效（Context 触发重渲染），无需刷新页面。

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { zh } from './zh'
import type { MsgKey } from './zh'
import { en } from './en'

export type Lang = 'zh' | 'en'
export type { MsgKey }

export type TFunc = (key: MsgKey, params?: Record<string, string | number>) => string

const LANG_STORAGE_KEY = 'pc-lang'
const DICTS: Record<Lang, Record<MsgKey, string>> = { zh, en }

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (raw, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : raw,
  )
}

/** BCP-47 tag，用于 Intl.RelativeTimeFormat / toLocaleString 等。 */
export function langTag(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : 'en'
}

interface LangContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TFunc
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // 持久化失败不阻塞切换（隐私模式等）
    }
  }, [])

  const t = useCallback<TFunc>(
    (key, params) => interpolate(DICTS[lang][key] ?? zh[key], params),
    [lang],
  )

  // html lang 与标签页标题跟随语言（无障碍 + 浏览器标签可读）
  useEffect(() => {
    document.documentElement.lang = langTag(lang)
    document.title = DICTS[lang].docTitle
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang 必须在 LangProvider 内使用')
  return ctx
}

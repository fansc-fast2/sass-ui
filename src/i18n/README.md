# i18n（自研轻量内核）

无第三方依赖：`LangProvider`（Context）+ 双语字典 + `useLang()` hook。
支持中（zh，默认）英（en）双语言，localStorage key 为 `pc-lang`。

## 结构

- `zh.ts`：中文字典，`export type MsgKey = keyof typeof zh` —— key 的唯一来源。
- `en.ts`：`const en: Record<MsgKey, string>` —— 缺 key / 多 key 直接编译报错（`tsc --noEmit`）。
- `index.tsx`：`LangProvider` / `useLang()`（返回 `{ lang, setLang, t }`）、`langTag()`（供
  `Intl.RelativeTimeFormat`、`toLocaleString` 使用）。`t('key', { name: value })` 支持 `{name}` 插值。

## 新增一种语言（例如 ja）

1. 复制 `en.ts` 为 `ja.ts`，把 `Record<MsgKey, string>` 的值全部翻译成日语；
   类型系统会强制你补齐每一个 key，不许遗漏。
2. 在 `index.tsx` 注册：
   - `export type Lang = 'zh' | 'en' | 'ja'`
   - `DICTS` 增加 `ja`
   - `langTag()` 增加 `'ja' → 'ja-JP'`
   - `readStoredLang()` 放行 `'ja'`
3. 语言切换控件（`components/LanguageSelect.tsx`）加一个 `<option>`。

## 约定

- UI chrome（导航、按钮、列头、空态、状态语义、提示）全部进字典。
- 业务数据（商品名、站点域名、后端返回的动态值）不进字典。
- 后端错误信封的 `message` 原样展示（后端已双语），只有前端自产的校验/提示文案进字典。
- 新文案不得携带 emoji / 装饰性 Unicode 符号（`tests/emoji-scan.cjs` 强制）。

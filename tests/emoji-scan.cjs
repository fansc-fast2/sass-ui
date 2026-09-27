#!/usr/bin/env node
/**
 * UI emoji / 符号字符扫描器。
 *
 * 扫描 src/** 与 index.html 中的 UI emoji（按 Unicode 区段），任何命中都会导致
 * 退出码 1。代码注释中允许的箭头（→）与带圈数字（①②③）默认放行——脚本
 * 无法完美区分注释与 UI 文本，因此维护一份"允许字符"白名单；新增 UI 时请勿
 * 引入白名单以外的符号字符。
 *
 * 用法：node tests/emoji-scan.cjs   （退出码 0 = 通过，1 = 发现违例）
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = [path.join(ROOT, 'src')]
const SCAN_FILES = [path.join(ROOT, 'index.html')]
const EXTS = new Set(['.tsx', '.ts', '.css', '.html', '.js', '.cjs'])

// 区段：emoji 主区、杂项符号、箭头/数学符号、变体选择符、勾叉、带圈数字等。
const BLOCKS = [
  { name: 'Emoji (U+1F300–U+1FAFF)', test: (cp) => cp >= 0x1f300 && cp <= 0x1faff },
  { name: 'Misc Symbols/Pictographs (U+2600–U+27BF)', test: (cp) => cp >= 0x2600 && cp <= 0x27bf },
  { name: 'Arrows (U+2190–U+21FF)', test: (cp) => cp >= 0x2190 && cp <= 0x21ff },
  { name: 'Misc Math (U+2B00–U+2BFF)', test: (cp) => cp >= 0x2b00 && cp <= 0x2bff },
  { name: 'Dingbats (U+2700–U+27BF)', test: (cp) => cp >= 0x2700 && cp <= 0x27bf },
  { name: 'Variation Selector (U+FE0F)', test: (cp) => cp === 0xfe0f },
  { name: 'Enclosed Alphanumerics ①②③ (U+2460–U+24FF)', test: (cp) => cp >= 0x2460 && cp <= 0x24ff },
]

// 注释白名单：仅当整行匹配"注释行"时才放行以下字符。
// （→ 用于注释里的流程描述；①②③ 用于注释里的步骤编号。）
const COMMENT_ARROW_RE = /→/
const COMMENT_CIRCLED_RE = /[①②③④⑤⑥⑦⑧⑨⑩]/

function isCommentishLine(line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--')
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      yield* walk(full)
    } else if (EXTS.has(path.extname(entry.name))) {
      yield full
    }
  }
}

const violations = []
let scanned = 0

const files = []
for (const dir of SCAN_DIRS) {
  if (fs.existsSync(dir)) files.push(...walk(dir))
}
for (const f of SCAN_FILES) {
  if (fs.existsSync(f)) files.push(f)
}

for (const file of files) {
  scanned += 1
  const rel = path.relative(ROOT, file)
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const isComment = isCommentishLine(line)
    for (const ch of line) {
      const cp = ch.codePointAt(0)
      const block = BLOCKS.find((b) => b.test(cp))
      if (!block) continue
      if (isComment && (COMMENT_ARROW_RE.test(ch) || COMMENT_CIRCLED_RE.test(ch))) continue
      violations.push({ file: rel, line: i + 1, ch, cp, block: block.name, text: line.trim().slice(0, 120) })
    }
  })
}

if (violations.length > 0) {
  console.error(`[emoji-scan] 发现 ${violations.length} 处 UI emoji/符号字符：`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  U+${v.cp.toString(16).toUpperCase().padStart(4, '0')} '${v.ch}'  [${v.block}]  ${v.text}`)
  }
  process.exit(1)
}

console.log(`[emoji-scan] 通过：扫描 ${scanned} 个文件，未发现 UI emoji/符号字符。`)
process.exit(0)

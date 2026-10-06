// Minimal xlsx sheet reader: shared strings + inline strings + numbers.
const fs = require('fs')
const path = require('path')
const dir = process.argv[2],
  sheet = process.argv[3]
const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
let shared = []
const ssFile = path.join(dir, 'xl/sharedStrings.xml')
if (fs.existsSync(ssFile)) {
  const ss = fs.readFileSync(ssFile, 'utf8')
  shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode(
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')
    )
  )
}
const xml = fs.readFileSync(path.join(dir, 'xl/worksheets', sheet), 'utf8')
const rows = []
for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const row = {}
  for (const c of r[1].matchAll(
    /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  )) {
    const col = c[1],
      attrs = c[2],
      inner = c[3] || ''
    const t = (attrs.match(/t="(\w+)"/) || [])[1]
    let v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1]
    if (t === 's') v = shared[Number(v)]
    else if (t === 'inlineStr')
      v = decode(
        [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => t[1])
          .join('')
      )
    else if (v !== undefined) v = Number(v)
    if (v !== undefined && v !== '') row[col] = v
  }
  if (Object.keys(row).length) rows.push(row)
}
console.log(JSON.stringify(rows))

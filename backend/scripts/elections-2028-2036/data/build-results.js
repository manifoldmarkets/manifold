// Builds presidential-results.json: two-party results for every unit the
// 2028–2036 seeds need, from the FEC state tables and The Downballot's
// district calculations. Run: node build-results.js > presidential-results.json
const fs = require('fs')
const { execSync } = require('child_process')
const sheet = (dir, name) =>
  JSON.parse(
    execSync(`node xlsx2json.js ${dir} ${name}`, {
      maxBuffer: 1 << 26,
    }).toString()
  )
const units = {}
const put = (key, year, d, r, total, source) => {
  units[key] ??= {}
  units[key][year] = { d, r, total, source }
}
// FEC 2024: columns M = HARRIS, Y = TRUMP, AE = TOTAL VOTES
for (const row of sheet('2024presgeresults', 'sheet1.xml')) {
  if (!/^[A-Z]{2}$/.test(String(row.A ?? ''))) continue
  put(
    row.A,
    2024,
    row.M,
    row.Y,
    row.AE,
    'FEC Official 2024 Presidential General Election Results (2024presgeresults.xlsx, Jan 16 2025)'
  )
}
// FEC 2020 Table 2: D = Biden, E = Trump, G = total
for (const row of sheet('federalelections2020', 'sheet3.xml')) {
  const st = String(row.A ?? '')
    .replace('*', '')
    .trim()
  if (!/^[A-Z]{2}$/.test(st)) continue
  put(
    st,
    2020,
    row.D,
    row.E,
    row.G,
    'FEC Federal Elections 2020, Table 2 (federalelections2020.xlsx)'
  )
}
// The Downballot exact totals on 2026 lines (2024 everywhere; 2020 where the lines are unchanged)
const csv = fs
  .readFileSync('downballot-2024-exact-on-2026-lines.csv', 'utf8')
  .split(/\r?\n/)
const parse = (line) => {
  const out = []
  let cur = '',
    q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}
const num = (s) => {
  const v = Number(String(s).replace(/[,%]/g, ''))
  return Number.isFinite(v) && s !== '' ? v : undefined
}
const districts = {}
for (const line of csv) {
  const c = parse(line)
  if (!/^[A-Z]{2}-(\d\d|AL)$/.test(c[0] ?? '')) continue
  const [h24, t24, tot24, , , , , b20, t20, tot20] = c.slice(4).map(num)
  const d = {
    incumbent: c[1],
    party: c[2],
    2024: { d: h24, r: t24, total: tot24 },
  }
  if (b20 !== undefined && t20 !== undefined)
    d[2020] = { d: b20, r: t20, total: tot20 }
  districts[c[0]] = d
}
const out = {
  generatedAt: new Date().toISOString(),
  sources: {
    fec2024:
      'https://www.fec.gov/resources/cms-content/documents/2024presgeresults.xlsx',
    fec2020:
      'https://www.fec.gov/resources/cms-content/documents/federalelections2020.xlsx (Table 2)',
    downballot:
      'https://docs.google.com/spreadsheets/d/1eZfaFI-c-PFOoKx1-zZA2MP0_dxRq_LVK0re3BOQqy0 (exact totals tab, 2024 results on 2026 district lines; 2020 only where lines are unchanged), via https://www.the-downballot.com/p/the-downballots-calculations-of-presidential',
  },
  states: units,
  districts,
}
console.log(JSON.stringify(out, null, 2))

// Wire created House batches into the election page data (a checkout of main).
// Local only: reads each batch's manifest + launch output (state.prod.json and
// dashboard-mapping.prod.json), verifies every market was created, published and
// seed-checked, then:
//   - HOUSE_RACE_MARKETS: adds { district, slug, preferOverPortfolio: true } so the
//     party market wins over a district-portfolio answer; replaces only the
//     reviewed candidate-only entries in REPLACEABLE; any other existing source fails;
//   - election-source-audit-2026.json: adds a ballot-party source with the audited
//     answer → party map.
// Preview by default; --write updates the files.
//   node elections-2026/wire-batches.cjs --repo /c/path/to/main-checkout \
//     --batch elections-2026/batch2/manifest.json=$P/batch2 \
//     --batch elections-2026/batch3/manifest.json=$P/batch3 [--write]
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const realId = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('PENDING:')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

// Candidate-only binaries the party markets replace (reviewed 2026-10-06).
const REPLACEABLE = {
  'AL-2': 'will-democrat-shomari-figures-win-a',
  'CO-4': 'will-lauren-boebert-be-reelected-to',
  'NC-9': 'will-richard-ojeda-win-north-caroli',
}

function verifiedRows(manifestFile, outDir) {
  const manifest = readJson(manifestFile)
  const state = readJson(path.join(outDir, 'state.prod.json'))
  const rows = readJson(path.join(outDir, 'dashboard-mapping.prod.json'))
  assert.equal(state.apiBase, 'https://api.manifold.markets', 'Production state required')
  assert.equal(state.series, manifest.series, 'Wrong manifest series')
  const ready = manifest.entries.filter((e) => e.status === 'ready')
  return ready.map((entry) => {
    const row = rows.find((r) => r.raceKey === entry.raceKey)
    const saved = state.entries[entry.raceKey]
    assert.ok(row && saved, `Missing launch result: ${entry.raceKey}`)
    assert.equal(row.status, 'created', `Unfinished mapping: ${entry.raceKey}`)
    assert.equal(saved.status, 'created', `Unfinished state: ${entry.raceKey}`)
    assert.ok(!saved.seedReviewRequired && !saved.pendingPublication, `Unverified/unpublished: ${entry.raceKey}`)
    assert.ok(realId(row.contractId) && realId(row.slug), `Pending market: ${entry.raceKey}`)
    assert.equal(row.contractId, saved.contractId)
    assert.equal(row.slug, saved.slug)
    assert.equal(row.list, 'HOUSE_RACE_MARKETS')
    assert.equal(row.key, entry.dashboard.key)
    assert.equal(row.proposition, 'ballot-party')
    assert.deepEqual(
      row.answers,
      entry.answerMeta.map((answer) => {
        const live = saved.answers?.find((a) => a.text === answer.label)
        assert.ok(realId(live?.id), `Missing answer: ${entry.raceKey} / ${answer.label}`)
        return { ...answer, answerId: live.id }
      })
    )
    return row
  })
}

function wireHouse(text, rows, ts) {
  const source = ts.createSourceFile('data.ts', text, ts.ScriptTarget.Latest, true)
  let array
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'HOUSE_RACE_MARKETS') array = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(array && ts.isArrayLiteralExpression(array), 'Missing HOUSE_RACE_MARKETS')
  const field = (node, prop) => {
    const f = node.properties.find((p) => p.name?.getText(source) === prop)
    return f?.initializer && ts.isStringLiteral(f.initializer) ? f.initializer.text : undefined
  }
  const replacements = []
  const additions = []
  let skipped = 0
  for (const row of rows) {
    const entry = { district: row.key, slug: row.slug, preferOverPortfolio: true }
    const existing = array.elements.filter((e) => field(e, 'district') === row.key)
    if (existing.some((e) => field(e, 'slug') === row.slug)) {
      skipped++
      continue
    }
    if (existing.length) {
      assert.equal(existing.length, 1, `Several sources for ${row.key}`)
      assert.equal(field(existing[0], 'slug'), REPLACEABLE[row.key], `Existing source for ${row.key}; review before replacement`)
      replacements.push({ start: existing[0].getStart(source), end: existing[0].end, text: JSON.stringify(entry) })
    } else additions.push(entry)
  }
  let out = text
  for (const r of replacements.sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + r.text + out.slice(r.end)
  if (additions.length) {
    const reparsed = ts.createSourceFile('data.ts', out, ts.ScriptTarget.Latest, true)
    let arr
    const find = (node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(reparsed) === 'HOUSE_RACE_MARKETS') arr = node.initializer
      ts.forEachChild(node, find)
    }
    find(reparsed)
    const end = arr.end - 1
    const before = out.slice(0, end).trimEnd()
    const separator = arr.elements.length && !before.endsWith(',') ? ',' : ''
    out = before + separator + '\n  // Party markets from the 2026-10-06 batches 2 and 3 (preferred over district portfolios).\n' + additions.map((a) => JSON.stringify(a) + ',').join('\n') + '\n' + out.slice(end)
  }
  return { text: out, added: additions.length, replaced: replacements.length, skipped }
}

function main() {
  const { values } = require('node:util').parseArgs({
    options: { repo: { type: 'string' }, batch: { type: 'string', multiple: true }, write: { type: 'boolean', default: false } },
  })
  assert.ok(values.repo && values.batch?.length, 'Usage: --repo <main checkout> --batch <manifest>=<outDir> [...] [--write]')
  const repo = path.resolve(values.repo)
  const ts = require(require.resolve('typescript', { paths: [repo] }))
  const prettier = require(require.resolve('prettier', { paths: [repo] }))
  const rows = values.batch.flatMap((b) => {
    const [manifest, outDir] = b.split('=')
    return verifiedRows(path.resolve(manifest), path.resolve(outDir))
  })
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length, 'A district appears in two batches')

  const files = new Map()
  const load = (file) => fs.readFileSync(path.join(repo, file), 'utf8')
  const add = (file, text) => {
    const original = load(file)
    const config = prettier.resolveConfig.sync(path.join(repo, file))
    const formatted = prettier.format(text, { ...config, filepath: file, endOfLine: original.includes('\r\n') ? 'crlf' : 'lf' })
    if (formatted !== original) files.set(file, formatted)
  }
  const houseFile = 'web/public/data/house-market-data.ts'
  const house = wireHouse(load(houseFile), rows, ts)
  add(houseFile, house.text)

  const auditFile = 'web/public/data/election-source-audit-2026.json'
  const audit = JSON.parse(load(auditFile))
  for (const row of rows) {
    const existing = audit.sources[row.slug]
    if (existing) assert.equal(existing.contractId, row.contractId, `Conflicting audit: ${row.slug}`)
    audit.sources[row.slug] = {
      contractId: row.contractId,
      kind: 'ballot-party',
      confidence: 'confirmed',
      races: [{ raceKey: row.raceKey, office: 'house', key: row.key }],
      answerParties: Object.fromEntries(row.answers.map((a) => [a.answerId, a.party])),
    }
  }
  add(auditFile, JSON.stringify(audit))

  if (values.write) for (const [file, text] of files) fs.writeFileSync(path.join(repo, file), text)
  console.log(JSON.stringify({ mode: values.write ? 'write' : 'preview', markets: rows.length, houseAdded: house.added, houseReplaced: house.replaced, houseAlreadyWired: house.skipped, files: [...files.keys()] }, null, 2))
}

if (require.main === module)
  try {
    main()
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }

module.exports = { verifiedRows, wireHouse, REPLACEABLE }

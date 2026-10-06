// Local-only production mapping import. No network, credentials, or market writes.
// Preview by default; --write updates the page's tracked source files.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const prettier = require('prettier')

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const realId = (value) =>
  typeof value === 'string' && value.length > 0 && !value.startsWith('PENDING:')

function verifiedRows(directory, manifest) {
  const state = readJson(path.join(directory, 'state.prod.json'))
  const rows = readJson(path.join(directory, 'dashboard-mapping.prod.json'))
  assert.equal(
    state.apiBase,
    'https://api.manifold.markets',
    'Production state required'
  )
  assert.equal(state.series, manifest.series, 'Wrong manifest series')
  assert.ok(state.creatorId, 'State must identify its creator')
  assert.ok(Array.isArray(rows), 'Expected mapping rows')
  assert.equal(
    new Set(rows.map((r) => r.raceKey)).size,
    rows.length,
    'Duplicate mapping keys'
  )
  const entries = new Map(manifest.entries.map((e) => [e.raceKey, e]))
  for (const row of rows)
    assert.ok(entries.has(row.raceKey), `Unknown race: ${row.raceKey}`)
  return manifest.entries
    .filter((e) => e.status === 'ready')
    .map((entry) => {
      const row = rows.find((r) => r.raceKey === entry.raceKey)
      const saved = state.entries[entry.raceKey]
      assert.ok(row && saved, `Missing launch result: ${entry.raceKey}`)
      assert.equal(
        row.status,
        'created',
        `Unfinished mapping: ${entry.raceKey}`
      )
      assert.equal(
        saved.status,
        'created',
        `Unfinished state: ${entry.raceKey}`
      )
      assert.ok(
        !saved.seedReviewRequired && !saved.pendingPublication,
        `Unverified/unpublished market: ${entry.raceKey}`
      )
      assert.ok(
        realId(row.contractId) && realId(row.slug),
        `Pending market: ${entry.raceKey}`
      )
      assert.equal(row.contractId, saved.contractId)
      assert.equal(row.slug, saved.slug)
      assert.equal(row.list, entry.dashboard.list)
      assert.equal(row.key, entry.dashboard.pageKey ?? entry.dashboard.key)
      assert.equal(row.proposition, entry.proposition)
      assert.equal(row.preferOverPortfolio, entry.dashboard.preferOverPortfolio)
      if (entry.kind === 'ballot-measure') {
        assert.equal(row.measure.state, entry.measure.state)
        assert.equal(row.measure.officialTitle, entry.measure.officialTitle)
        assert.equal(row.measure.yesOrientation, 'approve')
        assert.equal(row.measure.answerId, null)
      } else {
        assert.deepEqual(
          row.answers,
          entry.answerMeta.map((answer) => {
            const live = saved.answers?.find((a) => a.text === answer.label)
            assert.ok(
              realId(live?.id),
              `Missing answer: ${entry.raceKey} / ${answer.label}`
            )
            return { ...answer, answerId: live.id }
          })
        )
      }
      return row
    })
}

function extendArray(text, name, additions, key) {
  const source = ts.createSourceFile(
    'data.ts',
    text,
    ts.ScriptTarget.Latest,
    true
  )
  let array
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name)
      array = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(
    array && ts.isArrayLiteralExpression(array),
    `Missing array: ${name}`
  )
  const value = (node, prop) => {
    const field = node.properties.find((p) => p.name?.getText(source) === prop)
    return field?.initializer && ts.isStringLiteral(field.initializer)
      ? field.initializer.text
      : undefined
  }
  const fresh = additions.filter((addition) => {
    const existing = array.elements.filter(
      (e) => value(e, key) === addition[key]
    )
    if (existing.some((e) => value(e, 'slug') === addition.slug)) return false
    assert.equal(
      existing.length,
      0,
      `Existing ${name} source for ${addition[key]}; review before replacement`
    )
    return true
  })
  if (!fresh.length) return text
  const end = array.end - 1
  const before = text.slice(0, end).trimEnd()
  const separator = array.elements.length && !before.endsWith(',') ? ',' : ''
  return (
    before +
    separator +
    '\n' +
    fresh.map((r) => JSON.stringify(r) + ',').join('\n') +
    '\n' +
    text.slice(end)
  )
}

function planWiring(repo, raceDirectory, ballotDirectory) {
  const races = verifiedRows(
    raceDirectory,
    readJson(path.join(repo, 'backend/scripts/elections-2026/manifest.json'))
  )
  const ballots = verifiedRows(
    ballotDirectory,
    readJson(
      path.join(
        repo,
        'backend/scripts/elections-2026/ballot-measures/manifest.json'
      )
    )
  )
  const files = new Map()
  const load = (file) => fs.readFileSync(path.join(repo, file), 'utf8')
  const add = (file, text) => {
    const config = prettier.resolveConfig.sync(path.join(repo, file))
    const formatted = prettier.format(text, {
      ...config,
      filepath: file,
      endOfLine: 'crlf',
    })
    if (formatted !== load(file)) files.set(file, formatted)
  }
  for (const [list, file, key] of [
    ['HOUSE_RACE_MARKETS', 'web/public/data/house-market-data.ts', 'district'],
    ['governors2026', 'web/public/data/governors-data.ts', 'state'],
    ['senate2026', 'web/public/data/senate-state-data.ts', 'state'],
  ]) {
    const selected = races.filter((r) => r.list === list)
    if (!selected.length) continue
    add(
      file,
      extendArray(
        load(file),
        list,
        selected.map((r) => ({
          [key]: r.key,
          slug: r.slug,
          ...(list === 'HOUSE_RACE_MARKETS' && r.preferOverPortfolio
            ? { preferOverPortfolio: true }
            : {}),
        })),
        key
      )
    )
  }
  const auditFile = 'web/public/data/election-source-audit-2026.json'
  const audit = JSON.parse(load(auditFile))
  for (const row of races) {
    assert.ok(
      ['HOUSE_RACE_MARKETS', 'governors2026', 'senate2026'].includes(row.list)
    )
    assert.ok(['ballot-party', 'candidate'].includes(row.proposition))
    const existing = audit.sources[row.slug]
    if (existing)
      assert.equal(
        existing.contractId,
        row.contractId,
        `Conflicting audit: ${row.slug}`
      )
    audit.sources[row.slug] = {
      contractId: row.contractId,
      kind: row.proposition,
      confidence: 'confirmed',
      races: [
        {
          raceKey: row.raceKey,
          office:
            row.list === 'HOUSE_RACE_MARKETS'
              ? 'house'
              : row.list === 'governors2026'
              ? 'governor'
              : 'senate',
          key: row.key,
        },
      ],
      answerParties: Object.fromEntries(
        row.answers.map((a) => [a.answerId, a.party])
      ),
    }
  }
  add(auditFile, JSON.stringify(audit))
  const ballotFile = 'web/public/data/ballot-measures-2026.json'
  const data = JSON.parse(load(ballotFile))
  for (const row of ballots) {
    assert.equal(row.list, 'BALLOT_MEASURES')
    const measure = data.measures.find((m) => m.key === row.key)
    assert.ok(measure, `Unknown ballot page key: ${row.key}`)
    assert.equal(measure.state, row.measure.state)
    assert.equal(measure.title, row.measure.officialTitle)
    if (measure.source)
      assert.equal(
        measure.source.contractId,
        row.contractId,
        `Existing source: ${row.key}`
      )
    measure.source = {
      kind: 'binary',
      contractId: row.contractId,
      slug: row.slug,
      yesOrientation: 'approve',
      confidence: 'confirmed',
    }
    measure.coverage = 'created'
    delete measure.marketNote
  }
  add(ballotFile, JSON.stringify(data))
  const testFile = 'web/components/usa-map/ballot-measures-model.test.ts'
  const testText = load(testFile)
  const countCheck =
    /assert\.equal\(BALLOT_MEASURES\.filter\(\(m\) => m\.source\)\.length, \d+\)/
  assert.ok(
    countCheck.test(testText),
    'Linked-source count test changed; update explicitly'
  )
  add(
    testFile,
    testText.replace(
      countCheck,
      `assert.equal(BALLOT_MEASURES.filter((m) => m.source).length, ${
        data.measures.filter((m) => m.source).length
      })`
    )
  )
  return { files, races: races.length, ballots: ballots.length }
}

if (require.main === module) {
  try {
    const { values } = require('node:util').parseArgs({
      options: {
        races: { type: 'string' },
        ballots: { type: 'string' },
        write: { type: 'boolean', default: false },
      },
    })
    assert.ok(
      values.races && values.ballots,
      'Usage: node backend/scripts/wire-election-markets.cjs --races <production-race-output-dir> --ballots <production-ballot-output-dir> [--write]'
    )
    const repo = path.resolve(__dirname, '../..')
    const result = planWiring(
      repo,
      path.resolve(values.races),
      path.resolve(values.ballots)
    )
    if (values.write)
      for (const [file, text] of result.files)
        fs.writeFileSync(path.join(repo, file), text)
    console.log(
      JSON.stringify(
        {
          mode: values.write ? 'write-local-files' : 'preview',
          races: result.races,
          ballots: result.ballots,
          files: [...result.files.keys()],
        },
        null,
        2
      )
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { verifiedRows, extendArray, planWiring }

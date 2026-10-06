const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { planWiring } = require('../wire-election-markets.cjs')

const repo = path.resolve(__dirname, '../../..')
const inputFiles = [
  'backend/scripts/elections-2026/manifest.json',
  'backend/scripts/elections-2026/ballot-measures/manifest.json',
  'web/public/data/house-market-data.ts',
  'web/public/data/governors-data.ts',
  'web/public/data/election-source-audit-2026.json',
  'web/public/data/ballot-measures-2026.json',
  'web/components/usa-map/ballot-measures-model.test.ts',
]
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const save = (file, data) => fs.writeFileSync(file, JSON.stringify(data))

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'election-wiring-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  for (const file of inputFiles) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.copyFileSync(path.join(repo, file), path.join(dir, file))
  }
  for (const [name, file] of [
    ['races', inputFiles[0]],
    ['ballots', inputFiles[1]],
  ]) {
    const manifest = read(path.join(dir, file))
    const entries = manifest.entries.filter((e) => e.status === 'ready')
    const state = {
      series: manifest.series,
      apiBase: 'https://api.manifold.markets',
      creatorId: 'fixture-creator',
      entries: {},
    }
    const rows = entries.map((entry, i) => {
      const contractId = `fixture-${name}-${i}`
      const slug = `fixture-slug-${name}-${i}`
      const answers = (entry.answerMeta ?? []).map((a, j) => ({
        ...a,
        answerId: `${contractId}-answer-${j}`,
      }))
      state.entries[entry.raceKey] = {
        status: 'created',
        contractId,
        slug,
        answers: answers.map((a) => ({ id: a.answerId, text: a.label })),
      }
      return {
        raceKey: entry.raceKey,
        key: entry.dashboard.pageKey ?? entry.dashboard.key,
        list: entry.dashboard.list,
        preferOverPortfolio: entry.dashboard.preferOverPortfolio,
        contractId,
        slug,
        status: 'created',
        proposition: entry.proposition,
        answers,
        ...(entry.kind === 'ballot-measure'
          ? {
              measure: {
                state: entry.measure.state,
                officialTitle: entry.measure.officialTitle,
                yesOrientation: 'approve',
                answerId: null,
              },
            }
          : {}),
      }
    })
    fs.mkdirSync(path.join(dir, name))
    save(path.join(dir, name, 'state.prod.json'), state)
    save(path.join(dir, name, 'dashboard-mapping.prod.json'), rows)
  }
  return {
    dir,
    plan: () =>
      planWiring(dir, path.join(dir, 'races'), path.join(dir, 'ballots')),
  }
}

test('the complete production mapping previews five files, preserves existing sources, and is idempotent', (t) => {
  const f = fixture(t)
  const before = inputFiles.map((file) =>
    fs.readFileSync(path.join(f.dir, file), 'utf8')
  )
  const result = f.plan()
  assert.equal(result.races, 225)
  assert.equal(result.ballots, 102)
  assert.equal(result.files.size, 5)
  inputFiles.forEach((file, i) =>
    assert.equal(fs.readFileSync(path.join(f.dir, file), 'utf8'), before[i])
  )
  const ballots = JSON.parse(result.files.get(inputFiles[5]))
  const originals = JSON.parse(before[5])
  assert.equal(ballots.measures.filter((m) => m.source).length, 122)
  for (const original of originals.measures.filter(
    (m) => m.source || m.coverage === 'needs-creation-held'
  ))
    assert.deepEqual(
      ballots.measures.find((m) => m.key === original.key),
      original
    )
  for (const key of ['MN-permanent-school-fund', 'WA-il26-645'])
    assert.equal(
      ballots.measures.find((m) => m.key === key).source.yesOrientation,
      'approve'
    )
  const audit = JSON.parse(result.files.get(inputFiles[4]))
  for (const [slug, value] of Object.entries(JSON.parse(before[4]).sources))
    assert.deepEqual(audit.sources[slug], value)
  for (const [file, content] of result.files)
    fs.writeFileSync(path.join(f.dir, file), content)
  assert.equal(f.plan().files.size, 0)
})

for (const [name, mutate, error] of [
  [
    'dev state',
    (s) => {
      s.apiBase = 'https://api.dev.manifold.markets'
    },
    /Production state/,
  ],
  [
    'unpublished market',
    (s) => {
      Object.values(s.entries)[0].pendingPublication = true
    },
    /Unverified\/unpublished/,
  ],
  [
    'unverified seeds',
    (s) => {
      Object.values(s.entries)[0].seedReviewRequired = 'mismatch'
    },
    /Unverified\/unpublished/,
  ],
  [
    'unfinished run',
    (s) => {
      Object.values(s.entries)[0].status = 'in-flight'
    },
    /Unfinished state/,
  ],
  [
    'wrong answer identity',
    (s) => {
      Object.values(s.entries)[0].answers[0].id = 'mismatched-answer'
    },
    /deep-equal/,
  ],
])
  test(`rejects ${name} without writing files`, (t) => {
    const f = fixture(t),
      file = path.join(f.dir, 'races/state.prod.json'),
      state = read(file)
    mutate(state)
    save(file, state)
    assert.throws(f.plan, error)
  })

test('rejects an old untranslated ballot key and conflicting existing sources', (t) => {
  const f = fixture(t),
    file = path.join(f.dir, 'ballots/dashboard-mapping.prod.json'),
    rows = read(file)
  const original = rows[0].key
  rows[0].key = 'AL-amendment-1'
  save(file, rows)
  assert.throws(f.plan)
  rows[0].key = original
  save(file, rows)
  const pageFile = path.join(f.dir, inputFiles[5]),
    page = read(pageFile)
  page.measures.find((m) => m.key === original).source = {
    contractId: 'different-market',
  }
  save(pageFile, page)
  assert.throws(f.plan, /Existing source/)
})

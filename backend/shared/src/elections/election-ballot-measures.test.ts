import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  applyManifest,
  buildDashboardMapping,
  classifyExistingMarket,
  costOf,
  CreationState,
  ElectionApi,
  emptyState,
  idempotencyKeyFor,
  Manifest,
  MarketLike,
  measureDescriptionMarkdown,
  MeasureIdentity,
  MeasureManifestEntry,
  planOffline,
  validateManifest,
} from './election-market-creation'

describe('launch ballot page keys', () => {
  const launch = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../scripts/elections-2026/ballot-measures/manifest.json'
      ),
      'utf8'
    )
  ) as Manifest
  const page = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../web/public/data/ballot-measures-2026.json'
      ),
      'utf8'
    )
  ) as {
    measures: {
      key: string
      state: string
      title: string
      officialSourceUrl: string
    }[]
  }
  const entries = launch.entries as MeasureManifestEntry[]

  test('every planned or held measure maps to one page entry with the identical state and title', () => {
    expect(entries).toHaveLength(122)
    expect(entries.filter((e) => e.status === 'ready')).toHaveLength(102)
    expect(new Set(entries.map((e) => e.dashboard.pageKey)).size).toBe(122)
    const rows = buildDashboardMapping(launch, emptyState(launch))
    for (const [i, e] of entries.entries()) {
      const target = page.measures.find((m) => m.key === e.dashboard.pageKey)
      expect(target).toMatchObject({
        state: e.measure.state,
        title: e.measure.officialTitle,
      })
      expect(rows[i].key).toBe(target!.key)
      expect(rows[i].raceKey).toBe(e.raceKey)
      expect(rows[i].contractId).toBe(`PENDING:${e.raceKey}`)
    }
  })

  test('all eight designation exceptions match the reviewed page key and official source', () => {
    const reviewed = {
      '2026-measure-KS-citizen-only-voting-requirement':
        'KS-citizenship-voting',
      '2026-measure-MN-permanent-school-fund-distributions':
        'MN-permanent-school-fund',
      '2026-measure-NC-3-5-cap-on-state-income-tax-rate': 'NC-income-tax-cap',
      '2026-measure-NC-limits-on-local-property-tax-increases':
        'NC-property-tax-limit',
      '2026-measure-NC-photo-id-for-all-voting-methods': 'NC-voter-id',
      '2026-measure-NE-legislative-term-limit-of-three-terms': 'NE-term-limits',
      '2026-measure-NH-eliminating-register-of-probate-office':
        'NH-register-of-probate',
      '2026-measure-WA-other-ip26-645': 'WA-il26-645',
    }
    for (const [raceKey, pageKey] of Object.entries(reviewed)) {
      const e = entries.find((e) => e.raceKey === raceKey)!
      const target = page.measures.find((m) => m.key === pageKey)!
      expect(e.dashboard.pageKey).toBe(pageKey)
      expect(e.measure.officialSourceUrl).toBe(target.officialSourceUrl)
    }
  })

  test('created mapping rows use page keys without changing saved creation identity', () => {
    const e = entries.find((e) => e.raceKey === '2026-measure-CO-amendment-82')!
    const state = emptyState(launch)
    state.entries[e.raceKey] = {
      raceKey: e.raceKey,
      idempotencyKey: idempotencyKeyFor(launch.series, e.raceKey),
      payloadHash: 'test',
      status: 'created',
      contractId: 'created-market',
      slug: 'created-slug',
      updatedAt: '2026-10-06',
    }
    const before = JSON.stringify(state)
    const row = buildDashboardMapping(launch, state).find(
      (r) => r.raceKey === e.raceKey
    )
    expect(row).toMatchObject({
      key: 'CO-amend-82',
      status: 'created',
      contractId: 'created-market',
      slug: 'created-slug',
    })
    expect(JSON.stringify(state)).toBe(before)
  })
})

const NOW = Date.UTC(2026, 9, 3)
const CLOSE = Date.UTC(2026, 10, 3, 23, 59)

const identity = (over: Partial<MeasureIdentity> = {}): MeasureIdentity => ({
  cycle: 2026,
  electionDate: '2026-11-03',
  state: 'CA',
  stateName: 'California',
  designation: { kind: 'prop', value: '50', label: 'Proposition 50' },
  officialTitle: 'Test Measure Act',
  shortSubject: 'test subject',
  aliases: ['Test Measure Act', 'billionaire tax'],
  measureType: 'initiated statute',
  advisory: false,
  approvalRule: 'Simple majority of votes cast on the measure.',
  secondVoteOf: null,
  certifyingAuthority: 'the California Secretary of State',
  officialSourceUrl: 'https://voterguide.sos.ca.gov/',
  ...over,
})

const entry = (
  over: Partial<MeasureManifestEntry> = {},
  id: Partial<MeasureIdentity> = {}
): MeasureManifestEntry => {
  const m = identity(id)
  const slug = `${m.designation?.kind ?? 'q'}-${(
    m.designation?.value ?? 'x'
  ).toLowerCase()}`
  return {
    kind: 'ballot-measure',
    raceKey: `2026-measure-${m.state}-${slug}`,
    status: 'ready',
    measure: m,
    proposition: 'measure-approval',
    yesMeaning: 'the measure is approved at the November 3, 2026 election',
    shapeRationale: 'binary approval market',
    payload: {
      question: `Will ${m.stateName} ${m.designation?.label ?? ''} (${
        m.shortSubject
      }) be approved in the November 3, 2026 election?`.replace('  ', ' '),
      descriptionMarkdown: measureDescriptionMarkdown(m, {
        yesMeans: 'enacts the measure.',
        noMeans: 'leaves the law unchanged.',
        seedNote: 'Unsupported 50% seed; flagged for review.',
      }),
      outcomeType: 'BINARY',
      initialProb: 50,
      closeTime: CLOSE,
      liquidityTier: 1000,
      visibility: 'public',
    },
    seed: {
      basis: 'unsupported: no polling found',
      note: 'seed',
      needsReview: true,
    },
    searchTerms: [`${m.stateName} ${m.designation?.label ?? m.shortSubject}`],
    dashboard: {
      list: 'BALLOT_MEASURES',
      key: `2026-measure-${m.state}-${slug}`,
      state: m.state,
    },
    ...over,
  }
}

const manifest = (
  entries: MeasureManifestEntry[],
  cap: number | null = 100_000
): Manifest => ({
  kind: 'ballot-measures',
  manifestVersion: 't1',
  series: 'us-2026-ballot-measures-test',
  generatedAt: '2026-10-03',
  review: { approved: true, reviewedBy: 'reviewer', reviewedAt: '2026-10-04' },
  budget: { approvedMaxTotalMana: cap },
  entries,
})

const verdict = (e: MeasureManifestEntry, m: Partial<MarketLike>) =>
  classifyExistingMarket(e, {
    id: 'x',
    question: '',
    outcomeType: 'BINARY',
    ...m,
  } as MarketLike)

describe('ballot-measure validation', () => {
  test('explicit page keys must match the state and be unique', () => {
    const e = entry()
    e.dashboard.pageKey = 'AZ-prop-50'
    expect(validateManifest(manifest([e]), NOW).join(' ')).toMatch(/same state/)
    e.dashboard.pageKey = 'CA-prop-50'
    const other = entry(
      {},
      { designation: { kind: 'prop', value: '51', label: 'Proposition 51' } }
    )
    other.dashboard.pageKey = e.dashboard.pageKey
    expect(validateManifest(manifest([e, other]), NOW).join(' ')).toMatch(
      /duplicate dashboard.pageKey/
    )
  })

  test('a well-formed measure entry validates and costs its tier', () => {
    const e = entry()
    expect(validateManifest(manifest([e]), NOW)).toEqual([])
    expect(costOf(e.payload!).total).toBe(1000)
    expect(costOf({ ...e.payload!, liquidityTier: 10_000 }).total).toBe(10_000)
  })

  test('enforces the exact question shape, the state and the designation', () => {
    const e = entry()
    e.payload = { ...e.payload!, question: 'Will Prop 50 pass?' }
    const errors = validateManifest(manifest([e]), NOW).join('\n')
    expect(errors).toMatch(/question must read/)
    expect(errors).toMatch(/name the state/)
    expect(errors).toMatch(/official designation/)
  })

  test('the description must quote the threshold and state N/A, recount, certification and court rules', () => {
    const fl = entry(
      {},
      {
        state: 'FL',
        stateName: 'Florida',
        designation: { kind: 'amendment', value: '3', label: 'Amendment 3' },
        approvalRule:
          'At least 60% of votes cast on the measure (Fla. Const. art. XI, s. 5(e)).',
      }
    )
    fl.raceKey = '2026-measure-FL-amendment-3'
    fl.dashboard.key = fl.raceKey
    expect(validateManifest(manifest([fl]), NOW)).toEqual([])
    const broken = {
      ...fl,
      payload: {
        ...fl.payload!,
        descriptionMarkdown: fl
          .payload!.descriptionMarkdown.replace('At least 60%', 'A majority')
          .replace(/N\/A/g, 'NO'),
      },
    }
    const errors = validateManifest(manifest([broken]), NOW).join('\n')
    expect(errors).toMatch(/approval rule verbatim/)
    expect(errors).toMatch(/N\/A rule/)
  })

  test('a second-vote measure must say the 2026 vote counts; advisory questions must not promise law', () => {
    const nv = entry(
      {},
      {
        state: 'NV',
        stateName: 'Nevada',
        designation: { kind: 'question', value: '6', label: 'Question 6' },
        secondVoteOf: 'first approved by voters in 2024',
      }
    )
    nv.raceKey = '2026-measure-NV-question-6'
    nv.dashboard.key = nv.raceKey
    expect(nv.payload!.descriptionMarkdown).toMatch(/Only the 2026 vote counts/)
    expect(validateManifest(manifest([nv]), NOW)).toEqual([])
    const adv = entry({}, { advisory: true })
    adv.payload = {
      ...adv.payload!,
      question:
        'Will California Proposition 50 (test subject) become law and be approved in the November 3, 2026 election?',
    }
    expect(validateManifest(manifest([adv]), NOW).join('\n')).toMatch(
      /must not promise it becomes law/
    )
  })

  test('a binding amendment is never described as advisory (Idaho HJR 4)', () => {
    const id: Partial<MeasureIdentity> = {
      state: 'ID',
      stateName: 'Idaho',
      designation: { kind: 'hjr', value: '4', label: 'HJR 4' },
      measureType: 'legislatively referred constitutional amendment',
    }
    const wronglyAdvisory = entry({}, { ...id, advisory: true })
    expect(wronglyAdvisory.payload!.descriptionMarkdown).toMatch(/non-binding/)
    expect(
      validateManifest(manifest([wronglyAdvisory]), NOW).join('\n')
    ).toMatch(/only an advisory measure type can be marked advisory/)
    const binding = entry({}, id)
    expect(validateManifest(manifest([binding]), NOW)).toEqual([])
    binding.payload = {
      ...binding.payload!,
      descriptionMarkdown: binding.payload!.descriptionMarkdown.replace(
        'Only the',
        'This is a non-binding question. Only the'
      ),
    }
    expect(validateManifest(manifest([binding]), NOW).join('\n')).toMatch(
      /binding measure must not be described as advisory/
    )
  })

  test('ballot and race manifests (and their idempotency series) stay separate', () => {
    const m = {
      ...manifest([entry()]),
      kind: undefined,
      series: 'us-2026-general-v1',
    } as Manifest
    expect(validateManifest(m, NOW).join('\n')).toMatch(
      /ballot-measure entry in a races manifest/
    )
    const wrongSeries = { ...manifest([entry()]), series: 'us-2026-general-v1' }
    expect(validateManifest(wrongSeries, NOW).join('\n')).toMatch(
      /own \*ballot-measures\* series/
    )
    const k = '2026-measure-CA-prop-50'
    expect(idempotencyKeyFor('us-2026-ballot-measures-v1', k)).not.toBe(
      idempotencyKeyFor('us-2026-general-v1', k)
    )
  })

  test('an unsupported 50% seed must be flagged for review', () => {
    const e = entry({
      seed: {
        basis: 'unsupported: no polling found',
        note: 's',
        needsReview: false,
      },
    })
    expect(validateManifest(manifest([e]), NOW).join('\n')).toMatch(
      /flagged needsReview/
    )
  })
})

describe('ballot-measure duplicate detection', () => {
  const ca50 = entry()

  test('a binary approval market for the same measure is equivalent', () => {
    expect(
      verdict(ca50, { question: 'Will California Prop 50 pass in 2026?' })
        .verdict
    ).toBe('equivalent')
    expect(
      verdict(ca50, {
        question: 'Will California voters approve Proposition 50?',
      }).verdict
    ).toBe('equivalent')
  })

  test('a portfolio answer is matched by answer ID; resolved and reviewed answers are skipped', () => {
    const portfolio: Partial<MarketLike> = {
      id: 'port',
      outcomeType: 'MULTIPLE_CHOICE',
      question: 'Which 2026 California ballot measures will pass?',
      answers: [
        { id: 'a0', text: 'Prop 49 (rent)' },
        { id: 'a1', text: 'Prop 50 (test subject)' },
      ],
    }
    expect(verdict(ca50, portfolio)).toMatchObject({
      verdict: 'equivalent',
      answerId: 'a1',
    })
    const resolved = {
      ...portfolio,
      answers: [{ id: 'a1', text: 'Prop 50', resolution: 'NO' }],
    }
    expect(verdict(ca50, resolved).verdict).toBe('unrelated')
    const reviewed = entry({ reviewedRejectedAnswers: ['port#a1'] })
    expect(verdict(reviewed, portfolio).verdict).toBe('unrelated')
  })

  test('reversed YES wording is never treated as equivalent', () => {
    const v = verdict(ca50, {
      question: 'Will California Prop 50 fail in 2026?',
    })
    expect(v.verdict).toBe('ambiguous')
    expect(v.reason).toMatch(/opposite wording/)
  })

  test('the same number in another state or year is unrelated', () => {
    const nv6 = entry(
      {},
      {
        state: 'NV',
        stateName: 'Nevada',
        designation: { kind: 'question', value: '6', label: 'Question 6' },
        aliases: [],
      }
    )
    expect(
      verdict(nv6, { question: 'Will Massachusetts Question 6 pass in 2026?' })
        .verdict
    ).toBe('unrelated')
    expect(
      verdict(nv6, { question: 'Will Nevada Question 6 pass in 2024?' }).verdict
    ).toBe('unrelated')
    expect(
      verdict(nv6, {
        question: 'Will Nevada Question 6 (Right to Abortion) pass in 2026?',
      }).verdict
    ).toBe('equivalent')
    expect(
      verdict(ca50, { question: 'Will Arizona Prop 50 pass?' }).verdict
    ).toBe('unrelated')
  })

  test('qualification-only questions are unrelated; ballot-placement conditions are still approval', () => {
    expect(
      verdict(ca50, {
        question:
          'Will the California billionaire tax qualify for the 2026 ballot?',
      }).verdict
    ).toBe('unrelated')
    const v = verdict(ca50, {
      question:
        'Will the California billionaire tax pass if it is on the ballot in 2026?',
    })
    expect(v.verdict).toBe('equivalent')
    expect(v.reason).toMatch(/ballot placement/)
  })

  test('conditional, combined, repeal and stateless wording are held for review', () => {
    const p41 = entry(
      {},
      {
        designation: { kind: 'prop', value: '41', label: 'Proposition 41' },
        aliases: [],
      }
    )
    expect(
      verdict(p41, {
        question: 'If CA Prop 40 passes will 41 or 42 also pass?',
      }).verdict
    ).not.toBe('equivalent')
    const moA = entry(
      {},
      {
        state: 'MO',
        stateName: 'Missouri',
        designation: { kind: 'prop', value: 'A', label: 'Proposition A' },
        officialTitle: 'Referendum on the 2025 congressional map',
        aliases: [],
      }
    )
    expect(
      verdict(moA, {
        question:
          'Will Missouri voters repeal the new congressional map (Prop A)?',
      })
    ).toMatchObject({ verdict: 'ambiguous' })
    expect(verdict(ca50, { question: 'Will Prop 50 pass?' }).verdict).toBe(
      'ambiguous'
    )
  })
})

describe('ballot-measure apply, budget and resume', () => {
  function mockApi(existing: MarketLike[] = []) {
    const store = new Map<string, MarketLike>(existing.map((m) => [m.id, m]))
    const api: ElectionApi = {
      getMarket: jest.fn(async (id: string) => store.get(id)),
      searchMarkets: jest.fn(async () => [...store.values()]),
      me: jest.fn(async () => ({
        id: 'u',
        username: 'Creator',
        balance: 100_000,
      })),
      createMarket: jest.fn(async (body) => {
        store.set(body.idempotencyKey, {
          id: body.idempotencyKey,
          question: body.question,
          outcomeType: 'BINARY',
        })
        return { id: body.idempotencyKey }
      }),
    }
    return api
  }
  const opts = (extra = {}) => ({
    apply: true,
    creatorUsername: 'Creator',
    maxTotalMana: 10_000,
    now: () => NOW,
    sleep: async () => undefined,
    reconcileAttempts: 1,
    ...extra,
  })
  const two = () =>
    [
      entry(),
      entry(
        {},
        {
          state: 'AZ',
          stateName: 'Arizona',
          designation: { kind: 'prop', value: '141', label: 'Proposition 141' },
          aliases: [],
        }
      ),
    ].map((e) => ({
      ...e,
      raceKey: e.raceKey,
      dashboard: { ...e.dashboard, key: e.raceKey },
    }))

  test('an existing portfolio answer is recorded with its answer ID instead of creating', async () => {
    const api = mockApi([
      {
        id: 'port',
        outcomeType: 'MULTIPLE_CHOICE',
        question: 'Which 2026 California ballot measures will pass?',
        answers: [{ id: 'a1', text: 'Proposition 50' }],
      },
    ])
    const m = manifest([two()[0]])
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.skippedExisting).toEqual(['2026-measure-CA-prop-50'])
    expect(
      state.entries['2026-measure-CA-prop-50'].existing?.[0]
    ).toMatchObject({ id: 'port', answerId: 'a1' })
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  test('a portfolio hit is re-read in full, so a resolved answer seen as open in search does not block creation', async () => {
    const full: MarketLike = {
      id: 'port',
      outcomeType: 'MULTIPLE_CHOICE',
      question: 'Which 2026 California ballot measures will pass?',
      answers: [{ id: 'a1', text: 'Proposition 50', resolution: 'CANCEL' }],
    }
    const api = mockApi([full])
    // Search results carry lite answers: no resolution field.
    api.searchMarkets = jest.fn(async () => [
      { ...full, answers: [{ id: 'a1', text: 'Proposition 50' }] },
    ])
    const m = manifest([two()[0]])
    const res = await applyManifest(
      m,
      emptyState(m),
      api,
      opts(),
      () => undefined
    )
    expect(api.getMarket).toHaveBeenCalledWith('port')
    expect(res.created).toEqual(['2026-measure-CA-prop-50'])
  })

  test('a cancelled existing market does not block creation', async () => {
    const api = mockApi([
      {
        id: 'old',
        question: 'Will California Prop 50 pass in 2026?',
        outcomeType: 'BINARY',
        resolution: 'CANCEL',
      },
    ])
    const m = manifest([two()[0]])
    const res = await applyManifest(
      m,
      emptyState(m),
      api,
      opts(),
      () => undefined
    )
    expect(res.created).toEqual(['2026-measure-CA-prop-50'])
  })

  test('budget caps stop before the next binary, and a resumed run never re-creates', async () => {
    const api = mockApi()
    const m = manifest(two(), 1_500)
    const state: CreationState = emptyState(m)
    const first = await applyManifest(m, state, api, opts(), (s) => void s)
    expect(first.created).toHaveLength(1)
    expect(first.stoppedReason).toMatch(/approved manifest budget/)
    const second = await applyManifest(m, state, api, opts(), () => undefined)
    expect(second.created).toEqual([])
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    const rows = buildDashboardMapping(m, state)
    expect(rows[0].measure).toMatchObject({
      yesOrientation: 'approve',
      state: 'CA',
      designation: 'Proposition 50',
    })
    expect(rows[0].contractId).not.toMatch(/PENDING/)
    expect(rows[1].contractId).toBe('PENDING:2026-measure-AZ-prop-141')
  })

  test('the offline plan makes no requests and keeps measure keys', () => {
    const api = mockApi()
    const m = manifest(two())
    const plan = planOffline(m, emptyState(m))
    expect(plan.map((p) => p.action)).toEqual(['create', 'create'])
    expect(plan.map((p) => p.cost?.total)).toEqual([1000, 1000])
    expect(api.getMarket).not.toHaveBeenCalled()
    expect(api.createMarket).not.toHaveBeenCalled()
  })
})

import {
  ApiError,
  applyManifest,
  buildDashboardMapping,
  classifyExistingMarket,
  costOf,
  CreatePayload,
  CreationState,
  duplicateAction,
  duplicateDecision,
  ElectionApi,
  emptyState,
  formatOnlineFinding,
  idempotencyKeyFor,
  makeHttpApi,
  Manifest,
  ManifestEntry,
  MarketLike,
  onlineDuplicateOutcome,
  parseOnlineFinding,
  payloadHash,
  planOffline,
  plannedAnswerColors,
  SEARCH_PAGE_SIZE,
  seedMismatch,
  UNKNOWN_PAYLOAD_HASH,
  validateManifest,
} from './election-market-creation'

const NOW = Date.UTC(2026, 9, 3)
const CLOSE = Date.UTC(2026, 10, 3, 23)
const DESCRIPTION = 'Resolves to the party of the certified winner. '.repeat(10)

const partyEntry = (
  state: string,
  stateName: string,
  tier = 1000
): ManifestEntry => ({
  raceKey: `2026-governor-${state}-regular-general`,
  status: 'ready',
  identity: {
    cycle: 2026,
    office: 'governor',
    state,
    stateName,
    election: 'regular',
    round: 'Nov 3 general',
    candidateNames: ['Jane Doe', 'John Roe'],
  },
  proposition: 'ballot-party',
  shapeRationale: 'D v R',
  payload: {
    question: `Which party will win the 2026 ${stateName} governor election?`,
    descriptionMarkdown: DESCRIPTION,
    outcomeType: 'MULTIPLE_CHOICE',
    answers: [
      'Democratic Party',
      'Republican Party',
      'Another party or independent',
    ],
    answerProbs: [40, 58, 2],
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
    closeTime: CLOSE,
    liquidityTier: tier,
    visibility: 'public',
  },
  answerMeta: [
    { label: 'Democratic Party', kind: 'party', party: 'D' },
    { label: 'Republican Party', kind: 'party', party: 'R' },
    { label: 'Another party or independent', kind: 'other', party: 'other' },
  ],
  seed: { basis: 'test', note: 'seed' },
  searchTerms: [`${stateName} governor 2026`],
  dashboard: { list: 'governors2026', key: state },
})

// The 2028+ shape: Democratic and Republican listed, creator-only additions,
// and the server's "Other" at the remainder (2%).
const otherEntry = (state: string, stateName: string): ManifestEntry => {
  const e = partyEntry(state, stateName)
  return {
    ...e,
    payload: {
      ...e.payload!,
      answers: ['Democratic Party', 'Republican Party'],
      answerProbs: [40, 58],
      addAnswersMode: 'ONLY_CREATOR',
    },
    answerMeta: [
      { label: 'Democratic Party', kind: 'party', party: 'D' },
      { label: 'Republican Party', kind: 'party', party: 'R' },
      { label: 'Other', kind: 'other', party: 'other', isOther: true },
    ],
  }
}

const manifest = (
  entries: ManifestEntry[],
  cap: number | null = 100_000
): Manifest => ({
  manifestVersion: 't1',
  series: 'test-series',
  generatedAt: '2026-10-03',
  review: { approved: true, reviewedBy: 'reviewer', reviewedAt: '2026-10-04' },
  budget: { approvedMaxTotalMana: cap },
  entries,
})

const unresolved: ManifestEntry = {
  ...partyEntry('ZZ', 'Nowhere'),
  raceKey: '2026-house-LA-01-regular-general',
  status: 'unresolved',
  unresolvedFields: ['round: runoff date unverified'],
  payload: undefined,
}

type MockOpts = {
  existing?: MarketLike[]
  createFailures?: Record<number, Error> // by create-call index
  createdButHidden?: Set<number> // create succeeds server-side, then throws
  ignoreSeeds?: boolean // an API that drops answerProbs (even split)
  noIdOnSuccess?: Set<number> // 2xx whose body lacks the contract id
}
function mockApi(o: MockOpts = {}) {
  const store = new Map<string, MarketLike>()
  for (const m of o.existing ?? []) store.set(m.id, m)
  let createCalls = 0
  const api: ElectionApi & { creates: CreatePayload[]; reads: string[] } = {
    creates: [],
    reads: [],
    getMarket: jest.fn(async (id: string) => {
      api.reads.push(id)
      return store.get(id)
    }),
    searchMarkets: jest.fn(async (term: string) =>
      [...store.values()].filter((m) =>
        term
          .split(' ')
          .some((w) => m.question.toLowerCase().includes(w.toLowerCase()))
      )
    ),
    me: jest.fn(async () => ({
      id: 'u1',
      username: 'ElectionBot',
      balance: 1_000_000,
    })),
    publishMarket: jest.fn(async () => undefined),
    setAnswerColor: jest.fn(async () => undefined),
    createMarket: jest.fn(async (body) => {
      const i = createCalls++
      api.creates.push(body)
      // Like the server: answers that can be added get an "Other" answer at
      // the remainder of the seeds.
      const withOther =
        body.shouldAnswersSumToOne === true &&
        (body.addAnswersMode ?? 'DISABLED') !== 'DISABLED'
      const listed = body.answers?.length ?? 0
      const count = listed + (withOther ? 1 : 0)
      const make = () =>
        store.set(body.idempotencyKey, {
          id: body.idempotencyKey,
          slug: body.question.toLowerCase().replace(/\W+/g, '-').slice(0, 35),
          question: body.question,
          url: `https://manifold.markets/ElectionBot/${body.idempotencyKey}`,
          addAnswersMode: body.addAnswersMode ?? 'DISABLED',
          shouldAnswersSumToOne: body.shouldAnswersSumToOne,
          answers: [
            ...(body.answers ?? []).map((t, j) => ({
              id: `${body.idempotencyKey}a${j}`,
              text: t,
              isOther: false,
              probability: o.ignoreSeeds
                ? 1 / count
                : (body.answerProbs?.[j] ?? 0) / 100,
            })),
            ...(withOther
              ? [
                  {
                    id: `${body.idempotencyKey}aOther`,
                    text: 'Other',
                    isOther: true,
                    probability: o.ignoreSeeds
                      ? 1 / count
                      : (100 -
                          (body.answerProbs ?? []).reduce((a, b) => a + b, 0)) /
                        100,
                  },
                ]
              : []),
          ],
        })
      if (o.createdButHidden?.has(i)) {
        make()
        throw new ApiError('timeout after 60000ms', 'ambiguous')
      }
      if (o.createFailures?.[i]) throw o.createFailures[i]
      make()
      if (o.noIdOnSuccess?.has(i)) return { id: undefined as unknown as string }
      return { id: body.idempotencyKey }
    }),
  }
  return { api, store }
}

const opts = (extra: object = {}) => ({
  apply: true,
  creatorUsername: 'ElectionBot',
  maxTotalMana: 50_000,
  now: () => NOW,
  sleep: async () => undefined,
  reconcileAttempts: 2,
  ...extra,
})

describe('validation and cost', () => {
  test('cost includes per-answer ante and extra liquidity', () => {
    const e = partyEntry('AL', 'Alabama', 10_000)
    expect(costOf(e.payload!)).toMatchObject({
      ante: 10_000,
      total: 10_000,
      numAnswers: 3,
    })
    expect(costOf({ ...e.payload!, liquidityTier: 100 }).total).toBe(100) // max(3*25, 100)
    expect(
      costOf({ ...e.payload!, liquidityTier: 1000, extraLiquidity: 500 }).total
    ).toBe(1500)
    // An automatic Other answer is charged when answers can be added.
    expect(
      costOf({
        ...e.payload!,
        liquidityTier: 10_000,
        addAnswersMode: 'ONLY_CREATOR',
        answers: Array(10).fill('x'),
      }).total
    ).toBe(11_000)
  })

  test('rejects seeds that do not sum to 100 and missing metadata', () => {
    const bad = partyEntry('AL', 'Alabama')
    bad.payload = { ...bad.payload!, answerProbs: [40, 40, 2] }
    bad.answerMeta = bad.answerMeta!.slice(0, 2)
    const errors = validateManifest(manifest([bad]), NOW)
    expect(errors.join('\n')).toMatch(/sum to 82/)
    expect(errors.join('\n')).toMatch(/answerMeta/)
  })

  test('a creator-curated party market lists two answers and the server adds "Other"', () => {
    const ok = otherEntry('AL', 'Alabama')
    expect(validateManifest(manifest([ok]), NOW)).toEqual([])
    // Two answers + Other = 3 answers: the Ṁ1,000 minimum, as before.
    expect(costOf(ok.payload!)).toMatchObject({ numAnswers: 3, total: 1000 })
    // The raised 2028 tiers validate and cost the tier itself:
    // max(3 × 1,000, 10,000) and max(3 × 10,000, 100,000).
    for (const tier of [10_000, 100_000]) {
      const raised = otherEntry('AL', 'Alabama')
      raised.payload = { ...raised.payload!, liquidityTier: tier }
      expect(validateManifest(manifest([raised]), NOW)).toEqual([])
      expect(costOf(raised.payload!)).toMatchObject({
        numAnswers: 3,
        total: tier,
      })
    }
    const odd = otherEntry('AL', 'Alabama')
    odd.payload = { ...odd.payload!, liquidityTier: 5_000 }
    expect(validateManifest(manifest([odd]), NOW).join('\n')).toMatch(
      /liquidityTier must be one of/
    )

    const anyone = otherEntry('AL', 'Alabama')
    anyone.payload = { ...anyone.payload!, addAnswersMode: 'ANYONE' }
    expect(validateManifest(manifest([anyone]), NOW).join('\n')).toMatch(
      /addAnswersMode must be DISABLED or ONLY_CREATOR/
    )

    const noRoom = otherEntry('AL', 'Alabama')
    noRoom.payload = { ...noRoom.payload!, answerProbs: [60, 40] }
    expect(validateManifest(manifest([noRoom]), NOW).join('\n')).toMatch(
      /leaving 0% for "Other"/
    )

    const listsOther = otherEntry('AL', 'Alabama')
    listsOther.payload = {
      ...listsOther.payload!,
      answers: ['Democratic Party', 'Other'],
    }
    expect(validateManifest(manifest([listsOther]), NOW).join('\n')).toMatch(
      /the server adds "Other"; do not list it/
    )

    const noOtherMeta = otherEntry('AL', 'Alabama')
    noOtherMeta.answerMeta = noOtherMeta.answerMeta!.slice(0, 2)
    expect(validateManifest(manifest([noOtherMeta]), NOW).join('\n')).toMatch(
      /answerMeta must list every answer label in order, then "Other"/
    )

    const unflagged = otherEntry('AL', 'Alabama')
    unflagged.answerMeta = unflagged.answerMeta!.map((a) => ({
      ...a,
      isOther: undefined,
    }))
    expect(validateManifest(manifest([unflagged]), NOW).join('\n')).toMatch(
      /last answerMeta entry must be the server's "Other"/
    )
  })

  test('idempotency keys are deterministic, valid and distinct', () => {
    const a = idempotencyKeyFor('s', '2026-governor-AL-regular-general')
    expect(a).toBe(idempotencyKeyFor('s', '2026-governor-AL-regular-general'))
    expect(a).toMatch(
      /^[useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict]{10}$/
    )
    expect(a).not.toBe(
      idempotencyKeyFor('s', '2026-governor-AK-regular-general')
    )
  })
})

describe('dry run', () => {
  test('makes no requests at all and marks ids as pending', async () => {
    const { api } = mockApi()
    const m = manifest([partyEntry('AL', 'Alabama'), unresolved])
    const plan = planOffline(m, emptyState(m))
    expect(plan.map((p) => p.action)).toEqual(['create', 'unresolved'])
    const mapping = buildDashboardMapping(m, emptyState(m))
    expect(mapping[0].contractId).toBe(
      'PENDING:2026-governor-AL-regular-general'
    )
    expect(mapping[0].answers[0].answerId).toMatch(/^PENDING:/)
    expect(api.createMarket).not.toHaveBeenCalled()
    expect(api.getMarket).not.toHaveBeenCalled()
    expect(api.me).not.toHaveBeenCalled()
  })

  test('apply refuses without the flag, review, creator or budget', async () => {
    const { api } = mockApi()
    const m = manifest([partyEntry('AL', 'Alabama')], null)
    m.review.approved = false
    await expect(
      applyManifest(
        m,
        emptyState(m),
        api,
        { apply: false, now: () => NOW },
        () => undefined
      )
    ).rejects.toThrow(
      /apply flag not set[\s\S]*review[\s\S]*creator-username[\s\S]*max-mana[\s\S]*approvedMaxTotalMana/
    )
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  test('apply refuses a key that belongs to another account', async () => {
    const { api } = mockApi()
    const m = manifest([partyEntry('AL', 'Alabama')])
    await expect(
      applyManifest(
        m,
        emptyState(m),
        api,
        opts({ creatorUsername: 'Someone' }),
        () => undefined
      )
    ).rejects.toThrow(/belongs to @ElectionBot/)
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  test('apply rejects non-finite caps before reading an account or writing', async () => {
    for (const cap of [Infinity, NaN]) {
      const { api } = mockApi()
      const m = manifest([partyEntry('AL', 'Alabama')], cap)
      await expect(
        applyManifest(
          m,
          emptyState(m),
          api,
          opts({ maxTotalMana: cap }),
          () => undefined
        )
      ).rejects.toThrow(/max-mana/)
      expect(api.me).not.toHaveBeenCalled()
      expect(api.createMarket).not.toHaveBeenCalled()
    }
  })
})

describe('http client', () => {
  const okJson = (body: unknown, status = 200) => ({
    ok: status < 400,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  })

  test('answer colors use the authenticated edit endpoint and are blocked in dry runs', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(okJson({ status: 'success' }))
      .mockResolvedValueOnce(okJson({}))
    const api = makeHttpApi({
      apiBase: 'https://example.com',
      apiKey: 'mock',
      allowWrites: true,
      fetch,
    })
    await api.setAnswerColor!('market', 'answer', '#adc4e3')
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/edit-answer-cpmm',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Key mock',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractId: 'market',
          answerId: 'answer',
          color: '#adc4e3',
        }),
      })
    )
    await expect(
      api.setAnswerColor!('market', 'answer', '#adc4e3')
    ).rejects.toThrow(/did not confirm success/)
    const dryRun = makeHttpApi({
      apiBase: 'https://example.com',
      allowWrites: false,
      fetch,
    })
    await expect(
      dryRun.setAnswerColor!('market', 'answer', '#adc4e3')
    ).rejects.toThrow(/dry run/)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test('quiet publication uses the visibility update endpoint and requires success', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(okJson({ success: true }))
      .mockResolvedValueOnce(okJson({}))
    const api = makeHttpApi({
      apiBase: 'https://example.com',
      apiKey: 'mock',
      allowWrites: true,
      fetch,
    })
    await api.publishMarket!('test-id')
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/v0/market/test-id/update',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ visibility: 'public' }),
      })
    )
    await expect(api.publishMarket!('test-id')).rejects.toThrow(
      /did not confirm success/
    )
    const dryRun = makeHttpApi({
      apiBase: 'https://example.com',
      allowWrites: false,
      fetch,
    })
    await expect(dryRun.publishMarket!('test-id')).rejects.toThrow(/dry run/)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test('duplicate searches page with a creation-time cursor (not offset) and ask for answers', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        okJson(
          Array.from({ length: SEARCH_PAGE_SIZE }, (_, i) => ({
            id: String(i),
            question: 'An unrelated market',
            createdTime: 2_000_000 - i,
          }))
        )
      )
      .mockResolvedValueOnce(
        okJson([
          // the boundary row is re-read (same millisecond) and de-duplicated
          {
            id: String(SEARCH_PAGE_SIZE - 1),
            question: 'An unrelated market',
            createdTime: 2_000_001 - SEARCH_PAGE_SIZE,
          },
          {
            id: 'match',
            question: 'Alabama governor 2026: which party?',
            createdTime: 1_000,
          },
        ])
      )
    const api = makeHttpApi({
      apiBase: 'https://api.example',
      allowWrites: false,
      fetch,
    })
    const rows = await api.searchMarkets('Alabama governor 2026')
    expect(rows).toHaveLength(SEARCH_PAGE_SIZE + 1)
    expect(rows.some((r) => r.id === 'match')).toBe(true)
    const second = fetch.mock.calls[1][0] as string
    expect(second).toContain('sort=newest')
    expect(second).toContain(`beforeTime=${2_000_002 - SEARCH_PAGE_SIZE}`)
    expect(second).not.toContain('offset=')
    expect(fetch.mock.calls[0][0]).toContain('includeLiteAnswers=true')
  })

  test('a search that stops advancing fails closed', async () => {
    const page = Array.from({ length: SEARCH_PAGE_SIZE }, (_, i) => ({
      id: String(i),
      question: 'x',
      createdTime: 5,
    }))
    const fetch = jest.fn().mockResolvedValue(okJson(page))
    const api = makeHttpApi({
      apiBase: 'https://api.example',
      allowWrites: false,
      fetch,
    })
    await expect(api.searchMarkets('Question 1')).rejects.toThrow(
      /did not advance/
    )
  })

  test('a dry-run client refuses to write before any request and sends no key on reads', async () => {
    const fetch = jest.fn(async () => okJson([]))
    const api = makeHttpApi({
      apiBase: 'https://api.example',
      apiKey: 'secret',
      allowWrites: false,
      fetch,
    })
    await expect(
      api.createMarket({
        ...partyEntry('AL', 'Alabama').payload!,
        idempotencyKey: 'abcdefghij',
      })
    ).rejects.toThrow(/dry run/)
    expect(fetch).not.toHaveBeenCalled()
    await api.searchMarkets('Alabama governor 2026')
    await api.getMarket('abc')
    for (const call of fetch.mock.calls as unknown as [
      string,
      { method?: string; headers: Record<string, string> }
    ][]) {
      expect(call[1].method ?? 'GET').toBe('GET')
      expect(call[1].headers.Authorization).toBeUndefined()
    }
  })

  test('a 404 read is "not found", a POST timeout is ambiguous, a 400 is a rejection', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(okJson({ message: 'not found' }, 404))
      .mockRejectedValueOnce(
        new Error('The operation was aborted due to timeout')
      )
      .mockResolvedValueOnce(
        okJson(
          { message: 'Contract has already been created at https://…' },
          400
        )
      )
    const api = makeHttpApi({
      apiBase: 'https://api.example',
      apiKey: 'k',
      allowWrites: true,
      fetch,
    })
    expect(await api.getMarket('missing')).toBeUndefined()
    const body = {
      ...partyEntry('AL', 'Alabama').payload!,
      idempotencyKey: 'abcdefghij',
    }
    await expect(api.createMarket(body)).rejects.toMatchObject({
      kind: 'ambiguous',
    })
    await expect(api.createMarket(body)).rejects.toMatchObject({
      kind: 'rejected',
      status: 400,
    })
  })

  test('a 404 search and a success without an id both fail closed', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(okJson({ message: 'not found' }, 404))
      .mockResolvedValueOnce(okJson({ slug: 'no-id' }))
    const api = makeHttpApi({
      apiBase: 'https://api.example',
      apiKey: 'k',
      allowWrites: true,
      fetch,
    })
    await expect(api.searchMarkets('Alabama governor 2026')).rejects.toThrow(
      /no result list/
    )
    await expect(
      api.createMarket({
        ...partyEntry('AL', 'Alabama').payload!,
        idempotencyKey: 'abcdefghij',
      })
    ).rejects.toMatchObject({ kind: 'ambiguous' })
  })
})

describe('duplicate avoidance', () => {
  test('skips an equivalent market found by race identity, not title', async () => {
    const { api } = mockApi({
      existing: [
        {
          id: 'abc',
          question: 'Alabama governor 2026: which party?',
          answers: [
            { id: 'x', text: 'Democrats' },
            { id: 'y', text: 'Republicans' },
          ],
        },
      ],
    })
    const m = manifest([partyEntry('AL', 'Alabama')])
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.skippedExisting).toEqual(['2026-governor-AL-regular-general'])
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  test('holds an ambiguous match for review instead of creating', async () => {
    const { api } = mockApi({
      existing: [
        {
          id: 'p1',
          question: 'Who will win the Alabama governor Republican primary?',
        },
      ],
    })
    const m = manifest([partyEntry('AL', 'Alabama')])
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.needsReview).toEqual(['2026-governor-AL-regular-general'])
    expect(
      state.entries['2026-governor-AL-regular-general'].existing?.[0].id
    ).toBe('p1')
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  // The 2028+ manifests are official @ManifoldPolitics markets: only our own
  // EQUIVALENT market skips one; community and related markets are recorded
  // as information.
  const ownPolicy = { blockingCreators: ['ElectionBot'] }
  const equivalentBy = (creatorUsername: string | undefined): MarketLike => ({
    id: `eq-${creatorUsername ?? 'unknown'}`,
    question: 'Alabama governor 2026: which party?',
    ...(creatorUsername ? { creatorUsername } : {}),
    answers: [
      { id: 'x', text: 'Democrats' },
      { id: 'y', text: 'Republicans' },
    ],
  })
  const ambiguousBy = (creatorUsername: string): MarketLike => ({
    id: `amb-${creatorUsername}`,
    question: 'Who will win the Alabama governor Republican primary?',
    creatorUsername,
  })

  test('policy: a community EQUIVALENT market does not skip ours; it is recorded as information', async () => {
    const { api } = mockApi({ existing: [equivalentBy('SomeUser')] })
    const m = {
      ...manifest([partyEntry('AL', 'Alabama')]),
      duplicatePolicy: ownPolicy,
    }
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.skippedExisting).toEqual([])
    expect(res.needsReview).toEqual([])
    expect(res.created).toEqual(['2026-governor-AL-regular-general'])
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    const record = state.entries['2026-governor-AL-regular-general']
    expect(record.existing).toBeUndefined()
    expect(record.existingInfo).toEqual([
      expect.objectContaining({
        id: 'eq-SomeUser',
        creatorUsername: 'SomeUser',
        verdict: expect.stringMatching(/^equivalent: /),
      }),
    ])
  })

  test('policy: our own EQUIVALENT market still skips ours', async () => {
    const { api } = mockApi({
      existing: [equivalentBy('electionbot'), equivalentBy('SomeUser')],
    })
    const m = {
      ...manifest([partyEntry('AL', 'Alabama')]),
      duplicatePolicy: ownPolicy,
    }
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.skippedExisting).toEqual(['2026-governor-AL-regular-general'])
    expect(api.createMarket).not.toHaveBeenCalled()
    const record = state.entries['2026-governor-AL-regular-general']
    expect(record.existing?.map((x) => x.id)).toEqual(['eq-electionbot'])
    expect(record.existingInfo?.map((x) => x.id)).toEqual(['eq-SomeUser'])
  })

  test('policy: an AMBIGUOUS market, even our own, does not hold ours', async () => {
    const { api } = mockApi({
      existing: [ambiguousBy('ElectionBot'), ambiguousBy('SomeUser')],
    })
    const m = {
      ...manifest([partyEntry('AL', 'Alabama')]),
      duplicatePolicy: ownPolicy,
    }
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.needsReview).toEqual([])
    expect(res.created).toEqual(['2026-governor-AL-regular-general'])
    expect(
      state.entries['2026-governor-AL-regular-general'].existingInfo?.length
    ).toBe(2)
  })

  test('policy decisions, the unknown-creator case and the 2026 default', () => {
    expect(duplicateAction(undefined, { verdict: 'equivalent' })).toBe('skip')
    expect(duplicateAction(undefined, { verdict: 'ambiguous' })).toBe('review')
    expect(
      duplicateAction(ownPolicy, {
        verdict: 'equivalent',
        creatorUsername: 'X',
      })
    ).toBe('info')
    expect(
      duplicateAction(ownPolicy, {
        verdict: 'equivalent',
        creatorUsername: 'ELECTIONBOT',
      })
    ).toBe('skip')
    expect(
      duplicateAction(ownPolicy, {
        verdict: 'ambiguous',
        creatorUsername: 'ElectionBot',
      })
    ).toBe('info')
    // An equivalent market of unknown creator might be ours: hold it.
    expect(duplicateAction(ownPolicy, { verdict: 'equivalent' })).toBe('review')
    expect(
      duplicateDecision(ownPolicy, [
        { verdict: 'ambiguous', creatorUsername: 'A' },
        { verdict: 'equivalent', creatorUsername: 'B' },
      ]).action
    ).toBe('create')
  })

  test('the 2026 default is unchanged: no policy, a community EQUIVALENT skips', async () => {
    const { api } = mockApi({ existing: [equivalentBy('SomeUser')] })
    const m = manifest([partyEntry('AL', 'Alabama')])
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.skippedExisting).toEqual(['2026-governor-AL-regular-general'])
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  test('a policy must block on the creator itself and list real usernames', async () => {
    const { api } = mockApi()
    const m = {
      ...manifest([partyEntry('AL', 'Alabama')]),
      duplicatePolicy: { blockingCreators: ['SomeoneElse'] },
    }
    await expect(
      applyManifest(m, emptyState(m), api, opts(), () => undefined)
    ).rejects.toThrow(/blockingCreators must include the creator @ElectionBot/)
    expect(api.createMarket).not.toHaveBeenCalled()
    expect(
      validateManifest(
        { ...m, duplicatePolicy: { blockingCreators: [] } },
        NOW
      ).join('\n')
    ).toMatch(/blockingCreators must list one or more usernames/)
  })

  test('saved online lines carry the creator; the policy reads them back', () => {
    const line = formatOnlineFinding({
      verdict: 'equivalent',
      reason: 'same office/state/district/year with party outcomes',
      m: equivalentBy('Jack1'),
    })
    expect(line).toBe(
      'EQUIVALENT eq-Jack1 @Jack1 "Alabama governor 2026: which party?" (same office/state/district/year with party outcomes)'
    )
    expect(parseOnlineFinding(line)).toEqual({
      verdict: 'equivalent',
      id: 'eq-Jack1',
      creatorUsername: 'Jack1',
      question: 'Alabama governor 2026: which party?',
      reason: 'same office/state/district/year with party outcomes',
    })
    // Lines saved before creators were recorded still parse, without one.
    expect(
      parseOnlineFinding('AMBIGUOUS p1 "Who wins (really)?" (some reason)')
    ).toEqual({
      verdict: 'ambiguous',
      id: 'p1',
      question: 'Who wins (really)?',
      reason: 'some reason',
    })
    const lines = [
      line,
      'AMBIGUOUS m2 @ElectionBot "A related market" (related)',
    ]
    expect(onlineDuplicateOutcome(ownPolicy, lines).action).toBe('create')
    expect(onlineDuplicateOutcome(undefined, lines).action).toBe('skip')
    expect(
      onlineDuplicateOutcome(ownPolicy, [
        'EQUIVALENT m3 @ElectionBot "Ours" (same)',
      ]).action
    ).toBe('skip')
    expect(
      onlineDuplicateOutcome(ownPolicy, [
        'a market already exists at the reserved id k: q',
      ]).action
    ).toBe('already-created')
  })

  test('ignores markets the audit already reviewed and rejected', async () => {
    const e = partyEntry('AL', 'Alabama')
    e.reviewedRejectedContractIds = ['p1']
    const { api } = mockApi({
      existing: [
        {
          id: 'p1',
          question: 'Who will win the Alabama governor Republican primary?',
        },
      ],
    })
    const m = manifest([e])
    const res = await applyManifest(
      m,
      emptyState(m),
      api,
      opts(),
      () => undefined
    )
    expect(res.created).toHaveLength(1)
  })

  test('different district or year is unrelated', () => {
    const e = partyEntry('AL', 'Alabama')
    expect(
      classifyExistingMarket(e, {
        id: 'z',
        question: 'Which party will win the 2022 Alabama governor race?',
      }).verdict
    ).toBe('unrelated')
    const h: ManifestEntry = {
      ...e,
      identity: {
        ...e.identity,
        office: 'house',
        district: 7,
        state: 'CA',
        stateName: 'California',
      },
    }
    expect(
      classifyExistingMarket(h, {
        id: 'z',
        question: 'Who will win the 2026 US House race in CA-17?',
      }).verdict
    ).toBe('unrelated')
    expect(
      classifyExistingMarket(h, {
        id: 'z',
        question: "Which party will win California's 7th district in 2026?",
        answers: [
          { id: 'a', text: 'Democratic' },
          { id: 'b', text: 'Republican' },
        ],
      }).verdict
    ).toBe('equivalent')
  })

  test('answer lists that merely contain a candidate do not block a House race (live false positives)', () => {
    const e = partyEntry('AL', 'Alabama')
    const h: ManifestEntry = {
      ...e,
      identity: {
        ...e.identity,
        office: 'house',
        district: 3,
        candidateNames: ['Mike Rogers', 'Jane Doe'],
      },
    }
    const v = (question: string, answers: string[]) =>
      classifyExistingMarket(h, {
        id: 'z',
        question,
        answers: answers.map((text, i) => ({ id: `a${i}`, text })),
      }).verdict
    // Another state's Senate race with a namesake candidate.
    expect(
      v('Who will win the Michigan Senate Race 2026?', [
        'Mike Rogers',
        'Haley Stevens',
      ])
    ).toBe('unrelated')
    // Offices that are never ours, including "Speaker of the House".
    expect(
      v('Who will be the 30th US Secretary of Defense?', ['Mike Rogers'])
    ).toBe('unrelated')
    expect(
      v('Who will be the next Speaker of the House?', ['Mike Rogers'])
    ).toBe('unrelated')
    // A bare surname inside an answer is not a candidate match.
    expect(
      v('🏅2026 NASCAR Head-to-Head (H2H) Driver Markets', [
        'Rogers vs. Larson',
      ])
    ).toBe('unrelated')
    // Still blocked: our race named by candidate, or our office in the question.
    expect(v('Will Mike Rogers win re-election in 2026?', ['Yes'])).toBe(
      'ambiguous'
    )
    expect(
      v('Which US House districts in the South will a Democrat win?', [
        'Alabama 3rd (Mike Rogers-R)',
      ])
    ).not.toBe('unrelated')
    const g: ManifestEntry = {
      ...e,
      identity: {
        ...e.identity,
        candidateNames: ['Jocelyn Benson', 'John James'],
        state: 'MI',
        stateName: 'Michigan',
      },
    }
    expect(
      classifyExistingMarket(g, {
        id: 'z',
        question:
          'Will Secretary of State Jocelyn Benson win the 2026 Michigan governor race?',
      }).verdict
    ).not.toBe('unrelated')
  })

  test('never re-creates an entry recorded as created, and reconciles the reserved id first', async () => {
    const m = manifest([partyEntry('AL', 'Alabama')])
    const key = idempotencyKeyFor(m.series, '2026-governor-AL-regular-general')
    const { api } = mockApi({
      existing: [
        {
          id: key,
          question: 'Which party will win the 2026 Alabama governor election?',
        },
      ],
    })
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.created).toEqual(['2026-governor-AL-regular-general'])
    expect(api.createMarket).not.toHaveBeenCalled()
    const again = await applyManifest(m, state, api, opts(), () => undefined)
    expect(again.created).toEqual([])
    expect(api.createMarket).not.toHaveBeenCalled()
  })
})

describe('budget', () => {
  test('stops before the run cap would be exceeded, counting full cost', async () => {
    const { api } = mockApi()
    const m = manifest([
      partyEntry('AL', 'Alabama', 10_000),
      partyEntry('AK', 'Alaska', 10_000),
      partyEntry('AZ', 'Arizona', 1000),
    ])
    const res = await applyManifest(
      m,
      emptyState(m),
      api,
      opts({ maxTotalMana: 15_000 }),
      () => undefined
    )
    expect(res.created).toEqual(['2026-governor-AL-regular-general'])
    expect(res.spentThisRun).toBe(10_000)
    expect(res.stoppedReason).toMatch(/run budget/)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
  })

  test('enforces the approved manifest cap across runs', async () => {
    const { api } = mockApi()
    const m = manifest(
      [partyEntry('AL', 'Alabama', 10_000), partyEntry('AK', 'Alaska', 10_000)],
      12_000
    )
    const state = emptyState(m)
    await applyManifest(
      m,
      state,
      api,
      opts({ maxTotalMana: 10_000 }),
      () => undefined
    )
    const second = await applyManifest(
      m,
      state,
      api,
      opts({ maxTotalMana: 10_000 }),
      () => undefined
    )
    expect(second.stoppedReason).toMatch(/approved manifest budget/)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
  })
})

describe('partial failure and resume', () => {
  test('stops at a rejected entry, persists after each request, and resumes without re-creating', async () => {
    const { api } = mockApi({
      createFailures: {
        1: new ApiError('Question too spammy', 'rejected', 400),
      },
    })
    const m = manifest([
      partyEntry('AL', 'Alabama'),
      partyEntry('AK', 'Alaska'),
      partyEntry('AZ', 'Arizona'),
    ])
    const state: CreationState = emptyState(m)
    const snapshots: string[] = []
    const res = await applyManifest(m, state, api, opts(), (s) => {
      snapshots.push(JSON.stringify(s))
    })
    // A schema or content rejection would likely repeat for every entry.
    expect(res.created).toEqual(['2026-governor-AL-regular-general'])
    expect(res.failed).toEqual(['2026-governor-AK-regular-general'])
    expect(res.stoppedReason).toMatch(/create rejected for 2026-governor-AK/)
    expect(api.createMarket).toHaveBeenCalledTimes(2)
    expect(
      snapshots.some(
        (x) =>
          JSON.parse(x).entries['2026-governor-AL-regular-general']?.status ===
          'created'
      )
    ).toBe(true)
    // Resume from the persisted state: AL is not re-created, the failed AK is
    // left for review, and AZ is created.
    const resumed = JSON.parse(snapshots[snapshots.length - 1]) as CreationState
    const { api: api2 } = mockApi()
    const res2 = await applyManifest(m, resumed, api2, opts(), () => undefined)
    expect(res2.created).toEqual(['2026-governor-AZ-regular-general'])
    expect(api2.createMarket).toHaveBeenCalledTimes(1)
    const mapping = buildDashboardMapping(m, resumed)
    expect(mapping[0].contractId).toBe(
      idempotencyKeyFor(m.series, '2026-governor-AL-regular-general')
    )
    expect(
      mapping[0].answers.every((a) => !a.answerId.startsWith('PENDING'))
    ).toBe(true)
    expect(mapping[1].status).toBe('failed')
  })

  test('a failed entry whose market exists at the reserved id is recorded at full cost', async () => {
    const m = manifest([partyEntry('AL', 'Alabama')])
    const key = idempotencyKeyFor(m.series, '2026-governor-AL-regular-general')
    const state: CreationState = {
      ...emptyState(m),
      entries: {
        '2026-governor-AL-regular-general': {
          raceKey: '2026-governor-AL-regular-general',
          idempotencyKey: key,
          payloadHash: 'x',
          status: 'failed',
          reservedMana: 0,
          message: 'rate limited on every attempt',
          updatedAt: '2026-10-04',
        },
      },
    }
    const { api } = mockApi({
      existing: [{ id: key, question: 'Which party will win…?', answers: [] }],
    })
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.created).toEqual(['2026-governor-AL-regular-general'])
    expect(state.entries['2026-governor-AL-regular-general'].costMana).toBe(
      costOf(partyEntry('AL', 'Alabama').payload!).total
    )
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  test('a success without a contract id is reconciled by the reserved id, not marked failed', async () => {
    const { api } = mockApi({ noIdOnSuccess: new Set([0]) })
    const m = manifest([partyEntry('AL', 'Alabama')])
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.created).toEqual(['2026-governor-AL-regular-general'])
    expect(res.failed).toEqual([])
    expect(state.entries['2026-governor-AL-regular-general']).toMatchObject({
      status: 'created',
      costMana: 1000,
    })
  })

  test('stops after the first market if the API ignored the seeded answer probabilities', async () => {
    const { api } = mockApi({ ignoreSeeds: true })
    const m = manifest([
      partyEntry('AL', 'Alabama'),
      partyEntry('AK', 'Alaska'),
    ])
    const res = await applyManifest(
      m,
      emptyState(m),
      api,
      opts(),
      () => undefined
    )
    expect(res.created).toEqual(['2026-governor-AL-regular-general'])
    expect(res.stoppedReason).toMatch(/opened at 33.3%, not the seeded 40%/)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
  })

  test('a seed failure remains blocked on rerun even if that entry leaves the manifest', async () => {
    const { api } = mockApi({ ignoreSeeds: true })
    const first = partyEntry('AL', 'Alabama')
    const second = partyEntry('AK', 'Alaska')
    const m = manifest([first, second])
    const state = emptyState(m)
    const snapshots: string[] = []
    await applyManifest(m, state, api, opts(), (s) => {
      snapshots.push(JSON.stringify(s))
    })
    const resumed = JSON.parse(snapshots[snapshots.length - 1]) as CreationState
    expect(resumed.entries[first.raceKey]).toMatchObject({
      status: 'created',
      costMana: 1000,
      seedReviewRequired: expect.stringContaining('opened at 33.3%'),
    })
    const result = await applyManifest(
      manifest([second]),
      resumed,
      api,
      opts(),
      () => undefined
    )
    expect(result.stoppedReason).toMatch(/requires seed review/)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
  })

  test('reconciliation records full spend and stops before more writes when seeds differ', async () => {
    const first = partyEntry('AL', 'Alabama')
    const m = manifest([first, partyEntry('AK', 'Alaska')])
    const key = idempotencyKeyFor(m.series, first.raceKey)
    const { api } = mockApi({
      existing: [
        {
          id: key,
          question: first.payload!.question,
          answers: first.payload!.answers!.map((text, i) => ({
            id: `a${i}`,
            text,
            probability: 1 / 3,
          })),
        },
      ],
    })
    const state = emptyState(m)
    const result = await applyManifest(m, state, api, opts(), () => undefined)
    expect(result.stoppedReason).toMatch(/review its opening prices/)
    expect(state.entries[first.raceKey]).toMatchObject({
      status: 'created',
      costMana: 1000,
      seedReviewRequired: expect.stringContaining('opened at 33.3%'),
    })
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  test('successful creation without readable seed prices records spend and blocks subsequent runs', async () => {
    const { api } = mockApi()
    api.getMarket = jest.fn(async () => undefined)
    const first = partyEntry('AL', 'Alabama')
    const m = manifest([first, partyEntry('AK', 'Alaska')])
    const state = emptyState(m)
    const result = await applyManifest(m, state, api, opts(), () => undefined)
    expect(result.spentThisRun).toBe(1000)
    expect(result.stoppedReason).toMatch(/could not be read back/)
    expect(state.entries[first.raceKey]).toMatchObject({
      status: 'created',
      costMana: 1000,
      seedReviewRequired: expect.stringContaining('could not be read back'),
    })
    const resumed = await applyManifest(m, state, api, opts(), () => undefined)
    expect(resumed.stoppedReason).toMatch(/requires seed review/)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
  })

  test('a state file is bound to one API base and creator account', async () => {
    const m = manifest([partyEntry('AL', 'Alabama')])
    const state = emptyState(m)
    const { api } = mockApi()
    await applyManifest(
      m,
      state,
      api,
      opts({ apiBase: 'https://api.dev.example' }),
      () => undefined
    )
    expect(state).toMatchObject({
      apiBase: 'https://api.dev.example',
      creatorId: 'u1',
    })
    await expect(
      applyManifest(
        m,
        state,
        api,
        opts({ apiBase: 'https://api.prod.example' }),
        () => undefined
      )
    ).rejects.toThrow('State file was used against https://api.dev.example')
    const other = mockApi().api
    other.me = jest.fn(async () => ({
      id: 'u2',
      username: 'ElectionBot',
      balance: 1e6,
    }))
    await expect(
      applyManifest(
        m,
        state,
        other,
        opts({ apiBase: 'https://api.dev.example' }),
        () => undefined
      )
    ).rejects.toThrow(/belongs to creator u1/)
  })

  test('seed read-back matches answers by text and tolerates rounding', () => {
    const p = partyEntry('AL', 'Alabama').payload!
    const answers = (probs: number[]) => ({
      id: 'x',
      question: 'q',
      answers: p.answers!.map((text, i) => ({
        id: `a${i}`,
        text,
        probability: probs[i],
      })),
    })
    expect(seedMismatch(p, answers([0.401, 0.579, 0.02]))).toBeUndefined()
    expect(seedMismatch(p, answers([1 / 3, 1 / 3, 1 / 3]))).toMatch(
      /opened at 33.3%/
    )
    expect(seedMismatch(p, { id: 'x', question: 'q', answers: [] })).toMatch(
      /no readable probability/
    )
    expect(
      seedMismatch({ ...p, answerProbs: undefined }, answers([]))
    ).toBeUndefined()
  })

  test('read-back checks the server\'s "Other", the answer count and the answer mode', () => {
    const p = otherEntry('AL', 'Alabama').payload!
    const market = (other: number | undefined, extra: object = {}) => ({
      id: 'x',
      question: 'q',
      addAnswersMode: 'ONLY_CREATOR',
      answers: [
        { id: 'd', text: 'Democratic Party', isOther: false, probability: 0.4 },
        {
          id: 'r',
          text: 'Republican Party',
          isOther: false,
          probability: 0.58,
        },
        ...(other === undefined
          ? []
          : [{ id: 'o', text: 'Other', isOther: true, probability: other }]),
      ],
      ...extra,
    })
    expect(seedMismatch(p, market(0.02))).toBeUndefined()
    expect(seedMismatch(p, market(0.021))).toBeUndefined()
    expect(seedMismatch(p, market(0.1))).toMatch(
      /"Other" opened at 10.0%, not the seeded 2.0%/
    )
    expect(seedMismatch(p, market(undefined))).toMatch(
      /expected one "Other" answer, found 0/
    )
    expect(seedMismatch(p, market(0.02, { addAnswersMode: 'ANYONE' }))).toMatch(
      /addAnswersMode is ANYONE, expected ONLY_CREATOR/
    )
    const extra = market(0.02)
    extra.answers.push({
      id: 'g',
      text: 'Green Party',
      isOther: false,
      probability: 0,
    })
    expect(seedMismatch(p, extra)).toMatch(/4 answers, expected 3/)
    // A lite read without isOther still finds "Other" by its text.
    const lite = market(0.02)
    lite.answers = lite.answers.map((a) => ({
      id: a.id,
      text: a.text,
      probability: a.probability,
    })) as never
    expect(seedMismatch(p, lite)).toBeUndefined()
    // A fixed (2026) answer set must not grow an "Other".
    const fixed = partyEntry('AL', 'Alabama').payload!
    expect(
      seedMismatch(fixed, {
        id: 'x',
        question: 'q',
        answers: [
          ...fixed.answers!.map((text, i) => ({
            id: `a${i}`,
            text,
            isOther: false,
            probability: fixed.answerProbs![i] / 100,
          })),
          { id: 'o', text: 'Other', isOther: true, probability: 0 },
        ],
      })
    ).toMatch(/4 answers, expected 3/)
  })

  test('a 403 balance error stops the whole run', async () => {
    const { api } = mockApi({
      createFailures: {
        0: new ApiError('Balance must be at least 1000.', 'rejected', 403),
      },
    })
    const m = manifest([
      partyEntry('AL', 'Alabama'),
      partyEntry('AK', 'Alaska'),
    ])
    const res = await applyManifest(
      m,
      emptyState(m),
      api,
      opts(),
      () => undefined
    )
    expect(res.stoppedReason).toMatch(/account\/permission/)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
  })
})

describe('ambiguous timeouts', () => {
  test('a timeout whose create actually landed is reconciled read-only, never re-sent', async () => {
    const { api } = mockApi({ createdButHidden: new Set([0]) })
    const m = manifest([
      partyEntry('AL', 'Alabama'),
      partyEntry('AK', 'Alaska'),
    ])
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.created).toEqual([
      '2026-governor-AL-regular-general',
      '2026-governor-AK-regular-general',
    ])
    expect(api.createMarket).toHaveBeenCalledTimes(2) // one per entry, no retry
    expect(state.entries['2026-governor-AL-regular-general'].message).toMatch(
      /reconciled after/
    )
  })

  test('an unconfirmed timeout stops the run and is not re-sent on the next run by default', async () => {
    const { api, store } = mockApi({
      createFailures: { 0: new ApiError('socket hang up', 'ambiguous') },
    })
    const m = manifest([
      partyEntry('AL', 'Alabama'),
      partyEntry('AK', 'Alaska'),
    ])
    const state = emptyState(m)
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.pending).toEqual(['2026-governor-AL-regular-general'])
    expect(res.stoppedReason).toMatch(/ambiguous/)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    // Next run without --retry-unconfirmed: stop until the first is reconciled.
    const res2 = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res2.pending).toEqual(['2026-governor-AL-regular-general'])
    expect(res2.stoppedReason).toMatch(/unconfirmed create/)
    expect(
      (api.createMarket as jest.Mock).mock.calls.map((c) => c[0].question)
    ).toEqual(['Which party will win the 2026 Alabama governor election?'])
    // If the market later appears at the reserved id, a rerun records it.
    const key = idempotencyKeyFor(m.series, '2026-governor-AL-regular-general')
    store.set(key, {
      id: key,
      question: 'Which party will win the 2026 Alabama governor election?',
      answers: m.entries[0].payload!.answers!.map((text, i) => ({
        id: `a${i}`,
        text,
        probability: m.entries[0].payload!.answerProbs![i] / 100,
      })),
    })
    const res3 = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res3.created).toEqual([
      '2026-governor-AL-regular-general',
      '2026-governor-AK-regular-general',
    ])
    expect(api.createMarket).toHaveBeenCalledTimes(2)
  })

  test('rate limits wait and retry the same idempotency key', async () => {
    const { api } = mockApi({
      createFailures: {
        0: new ApiError('Too many requests', 'rate-limited', 429, 10),
      },
    })
    const m = manifest([partyEntry('AL', 'Alabama')])
    const res = await applyManifest(
      m,
      emptyState(m),
      api,
      opts(),
      () => undefined
    )
    expect(res.created).toHaveLength(1)
    const keys = (api.createMarket as jest.Mock).mock.calls.map(
      (c) => c[0].idempotencyKey
    )
    expect(new Set(keys).size).toBe(1)
  })
})

describe('quiet creation', () => {
  test('sets audited party colors before publication, including named and DFL answers', async () => {
    const { api } = mockApi()
    const first = partyEntry('MN', 'Minnesota')
    first.answerMeta![0].label = first.payload!.answers![0] =
      'Democratic Party (DFL) — Jane Doe'
    const m = manifest([first])
    const state = emptyState(m)
    const result = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(result.stoppedReason).toBeUndefined()
    const record = state.entries[first.raceKey]
    expect((api.setAnswerColor as jest.Mock).mock.calls).toEqual([
      [record.contractId, record.answers![0].id, '#adc4e3'],
      [record.contractId, record.answers![1].id, '#ecbab5'],
      [record.contractId, record.answers![2].id, '#9e9fbd'],
    ])
    expect(
      (api.setAnswerColor as jest.Mock).mock.invocationCallOrder[2]
    ).toBeLessThan((api.publishMarket as jest.Mock).mock.invocationCallOrder[0])
    expect(Object.keys(record.answerColorsApplied!)).toHaveLength(3)
    await applyManifest(m, state, api, opts({ quiet: true }), () => undefined)
    expect(api.setAnswerColor).toHaveBeenCalledTimes(3)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
  })

  test('a failed color edit preserves spend and resumes the remaining edits without recreating', async () => {
    const { api } = mockApi()
    const first = partyEntry('AL', 'Alabama')
    const m = manifest([first])
    const state = emptyState(m)
    ;(api.setAnswerColor as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('timeout'))
    const result = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(result.stoppedReason).toMatch(/answer colors are pending/)
    expect(result.spentThisRun).toBe(1000)
    expect(state.entries[first.raceKey].costMana).toBe(1000)
    expect(api.publishMarket).not.toHaveBeenCalled()
    const resumed = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(resumed.stoppedReason).toBeUndefined()
    expect(resumed.spentThisRun).toBe(0)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    expect(api.setAnswerColor).toHaveBeenCalledTimes(4)
    expect(api.publishMarket).toHaveBeenCalledTimes(1)
  })

  test('a creator-curated market colors the server\'s "Other" and maps its answer id', async () => {
    const { api } = mockApi()
    const first = otherEntry('AL', 'Alabama')
    const m = manifest([first])
    const state = emptyState(m)
    const result = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(result.stoppedReason).toBeUndefined()
    expect(api.creates[0]).toMatchObject({
      answers: ['Democratic Party', 'Republican Party'],
      answerProbs: [40, 58],
      addAnswersMode: 'ONLY_CREATOR',
      visibility: 'unlisted',
    })
    const record = state.entries[first.raceKey]
    expect(record.costMana).toBe(1000)
    const id = record.contractId!
    expect((api.setAnswerColor as jest.Mock).mock.calls).toEqual([
      [id, `${id}a0`, '#adc4e3'],
      [id, `${id}a1`, '#ecbab5'],
      [id, `${id}aOther`, '#9e9fbd'],
    ])
    expect(api.publishMarket).toHaveBeenCalledWith(id)
    const [row] = buildDashboardMapping(m, state)
    expect(row.answers.map((a) => [a.label, a.party, a.answerId])).toEqual([
      ['Democratic Party', 'D', `${id}a0`],
      ['Republican Party', 'R', `${id}a1`],
      ['Other', 'other', `${id}aOther`],
    ])
    // Before creation the Other row is a placeholder like the others.
    const [planned] = buildDashboardMapping(m, emptyState(m))
    expect(planned.answers[2].answerId).toBe(`PENDING:${first.raceKey}#Other`)
  })

  test('an API that ignored the seeds is caught on the "Other" answer too', async () => {
    const { api } = mockApi({ ignoreSeeds: true })
    const m = manifest([
      otherEntry('AL', 'Alabama'),
      otherEntry('AK', 'Alaska'),
    ])
    const state = emptyState(m)
    const result = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(result.stoppedReason).toMatch(/opened at 33.3%/)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    expect(api.publishMarket).not.toHaveBeenCalled()
  })

  test('candidate colors come from audited affiliation, not their names or answer order', () => {
    const first = partyEntry('RI', 'Rhode Island')
    first.answerMeta = [
      { label: 'Candidate A', kind: 'candidate', party: 'I' },
      { label: 'Candidate B', kind: 'candidate', party: 'R' },
      { label: 'Candidate C', kind: 'candidate', party: 'D' },
    ]
    expect(plannedAnswerColors(first).map((a) => a.color)).toEqual([
      '#80cbc4',
      '#ecbab5',
      '#adc4e3',
    ])
  })

  test('creates unlisted, verifies seeds, then publishes while keeping the manifest public', async () => {
    const { api } = mockApi()
    const first = partyEntry('AL', 'Alabama')
    const m = manifest([first])
    const state = emptyState(m)
    const result = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(result.stoppedReason).toBeUndefined()
    expect(api.creates[0].visibility).toBe('unlisted')
    expect(first.payload!.visibility).toBe('public')
    expect(api.publishMarket).toHaveBeenCalledWith(
      state.entries[first.raceKey].contractId
    )
    expect(state.entries[first.raceKey]).toMatchObject({
      status: 'created',
      costMana: 1000,
      pendingPublication: false,
    })
  })

  test('publication errors preserve spend and resume without creating or charging twice', async () => {
    const { api } = mockApi()
    const first = partyEntry('AL', 'Alabama')
    const m = manifest([first, partyEntry('AK', 'Alaska')])
    const state = emptyState(m)
    ;(api.publishMarket as jest.Mock).mockRejectedValueOnce(
      new Error('timeout')
    )
    const result = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(result.stoppedReason).toMatch(/publication is pending/)
    expect(result.spentThisRun).toBe(1000)
    expect(state.entries[first.raceKey]).toMatchObject({
      status: 'created',
      costMana: 1000,
      pendingPublication: true,
    })
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    const resumed = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(resumed.stoppedReason).toBeUndefined()
    expect(resumed.spentThisRun).toBe(1000)
    expect(api.createMarket).toHaveBeenCalledTimes(2)
    expect(api.publishMarket).toHaveBeenCalledTimes(3)
    expect(state.entries[first.raceKey].pendingPublication).toBe(false)
  })

  test('bad seeded prices leave the market unlisted and block publication', async () => {
    const { api } = mockApi({ ignoreSeeds: true })
    const first = partyEntry('AL', 'Alabama')
    const m = manifest([first])
    const state = emptyState(m)
    const result = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(result.stoppedReason).toMatch(/seeded/)
    expect(state.entries[first.raceKey].pendingPublication).toBe(true)
    expect(api.publishMarket).not.toHaveBeenCalled()
  })

  // Resuming after a criteria edit must not publish the old text.
  const edited = (e: ManifestEntry): ManifestEntry => ({
    ...e,
    payload: {
      ...e.payload!,
      descriptionMarkdown: `${DESCRIPTION}Edited after creation.`,
    },
  })

  test('an unpublished market whose payload changed since creation stays unlisted until a person records the new hash', async () => {
    const { api } = mockApi()
    const first = otherEntry('AL', 'Alabama')
    const state = emptyState(manifest([first]))
    ;(api.publishMarket as jest.Mock).mockRejectedValueOnce(
      new Error('timeout')
    )
    const firstRun = await applyManifest(
      manifest([first]),
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(firstRun.stoppedReason).toMatch(/publication is pending/)
    expect(state.entries[first.raceKey].pendingPublication).toBe(true)

    const changed = edited(first)
    const resumed = await applyManifest(
      manifest([changed]),
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    const record = state.entries[first.raceKey]
    expect(resumed.stoppedReason).toMatch(
      /created unlisted as .+ from an earlier payload and is not published/
    )
    expect(resumed.stoppedReason).toContain(payloadHash(changed.payload))
    expect(api.publishMarket).toHaveBeenCalledTimes(1) // only the failed try
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    expect(record.pendingPublication).toBe(true)

    // After updating the market, the operator records the new hash.
    record.payloadHash = payloadHash(changed.payload)
    const fixed = await applyManifest(
      manifest([changed]),
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(fixed.stoppedReason).toBeUndefined()
    expect(api.publishMarket).toHaveBeenCalledTimes(2)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    expect(state.entries[first.raceKey].pendingPublication).toBe(false)
  })

  test('a published market whose payload changed since is left alone', async () => {
    const { api } = mockApi()
    const first = otherEntry('AL', 'Alabama')
    const state = emptyState(manifest([first]))
    await applyManifest(
      manifest([first]),
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(api.publishMarket).toHaveBeenCalledTimes(1)
    const logs: string[] = []
    const again = await applyManifest(
      manifest([edited(first)]),
      state,
      api,
      opts({ quiet: true, log: (l: string) => logs.push(l) }),
      () => undefined
    )
    expect(again.stoppedReason).toBeUndefined()
    expect(logs.join('\n')).toMatch(/payload changed since — NOT recreating/)
    expect(api.publishMarket).toHaveBeenCalledTimes(1)
    expect(api.setAnswerColor).toHaveBeenCalledTimes(3) // first run only
    expect(api.createMarket).toHaveBeenCalledTimes(1)
  })

  test('a market found at the reserved id after an unconfirmed create from an earlier payload is not published', async () => {
    const first = otherEntry('AL', 'Alabama')
    const m = manifest([edited(first)])
    const key = idempotencyKeyFor(m.series, first.raceKey)
    const { api } = mockApi({
      existing: [
        {
          id: key,
          question: first.payload!.question,
          answers: [
            { id: 'd', text: 'Democratic Party', probability: 0.4 },
            { id: 'r', text: 'Republican Party', probability: 0.58 },
            { id: 'o', text: 'Other', probability: 0.02, isOther: true },
          ],
        },
      ],
    })
    const state: CreationState = {
      ...emptyState(m),
      entries: {
        [first.raceKey]: {
          raceKey: first.raceKey,
          idempotencyKey: key,
          payloadHash: payloadHash(first.payload),
          status: 'pending-reconciliation',
          reservedMana: 1000,
          pendingPublication: true,
          updatedAt: '2026-11-05',
        },
      },
    }
    const res = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true, retryUnconfirmed: true }),
      () => undefined
    )
    expect(res.stoppedReason).toMatch(
      new RegExp(`created unlisted as ${key} from an earlier payload`)
    )
    expect(state.entries[first.raceKey]).toMatchObject({
      status: 'created',
      contractId: key,
      costMana: 1000,
      pendingPublication: true,
      payloadHash: payloadHash(first.payload),
    })
    expect(api.createMarket).not.toHaveBeenCalled()
    expect(api.publishMarket).not.toHaveBeenCalled()
    expect(api.setAnswerColor).not.toHaveBeenCalled()
  })

  // A lost or new state file: a market already exists at the reserved id, and
  // nothing records the payload it was created with.
  const unrecorded = () => {
    const first = otherEntry('AL', 'Alabama')
    const m = manifest([first, otherEntry('AK', 'Alaska')])
    const key = idempotencyKeyFor(m.series, first.raceKey)
    const { api } = mockApi({
      existing: [
        {
          id: key,
          // Whatever an earlier run created it with.
          question: 'Which party will win the 2026 Alabama governor race?',
          answers: [
            { id: 'd', text: 'Democratic Party', probability: 0.4 },
            { id: 'r', text: 'Republican Party', probability: 0.58 },
            { id: 'o', text: 'Other', probability: 0.02, isOther: true },
          ],
        },
      ],
    })
    return { first, m, key, api, state: emptyState(m) }
  }

  test('a market at the reserved id with no record of its payload stays unlisted and stops the run', async () => {
    const { first, m, key, api, state } = unrecorded()
    const res = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(res.stoppedReason).toMatch(
      new RegExp(
        `a market exists at the reserved id \\(${key}\\) but this state file has no record of the payload it was created with`
      )
    )
    expect(res.stoppedReason).toContain(payloadHash(first.payload))
    expect(state.entries[first.raceKey]).toMatchObject({
      status: 'created',
      contractId: key,
      payloadHash: UNKNOWN_PAYLOAD_HASH,
      pendingPublication: true,
      costMana: 1000,
    })
    expect(state.entries[first.raceKey].seedReviewRequired).toBeUndefined()
    expect(api.publishMarket).not.toHaveBeenCalled()
    expect(api.setAnswerColor).not.toHaveBeenCalled()
    // The run stopped there: Alaska was not created.
    expect(api.createMarket).not.toHaveBeenCalled()
  })

  test('it keeps stopping until a person records the hash, then publishes normally', async () => {
    const { first, m, key, api, state } = unrecorded()
    await applyManifest(m, state, api, opts({ quiet: true }), () => undefined)
    const again = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(again.stoppedReason).toMatch(
      new RegExp(`created unlisted as ${key} from an earlier payload`)
    )
    expect(api.publishMarket).not.toHaveBeenCalled()
    expect(api.createMarket).not.toHaveBeenCalled()

    // Checked on the site; the operator records the manifest's hash.
    state.entries[first.raceKey].payloadHash = payloadHash(first.payload)
    const fixed = await applyManifest(
      m,
      state,
      api,
      opts({ quiet: true }),
      () => undefined
    )
    expect(fixed.stoppedReason).toBeUndefined()
    expect(api.publishMarket).toHaveBeenCalledWith(key)
    expect(state.entries[first.raceKey].pendingPublication).toBe(false)
    // finishCreation ran for it (three colors), and the run went on to Alaska.
    expect(
      (api.setAnswerColor as jest.Mock).mock.calls.filter(([id]) => id === key)
    ).toHaveLength(3)
    expect(api.createMarket).toHaveBeenCalledTimes(1)
    expect(api.publishMarket).toHaveBeenCalledTimes(2)
  })

  test('without quiet publication the unrecorded market is adopted as before', async () => {
    const { first, m, key, api, state } = unrecorded()
    const res = await applyManifest(m, state, api, opts(), () => undefined)
    expect(res.stoppedReason).toBeUndefined()
    expect(state.entries[first.raceKey]).toMatchObject({
      status: 'created',
      contractId: key,
      payloadHash: payloadHash(first.payload),
    })
    expect(api.publishMarket).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2028+ generic markets: cycle-aware classification and the president office
// ---------------------------------------------------------------------------

const genericEntry = (
  office: 'senate' | 'governor' | 'house' | 'president',
  state: string,
  stateName: string,
  district?: number,
  cycle = 2028
): ManifestEntry => ({
  ...partyEntry(state, stateName),
  raceKey:
    office === 'president'
      ? `${cycle}-president-${state}${
          district !== undefined ? `-0${district}` : ''
        }-general`
      : `${cycle}-${office}-${state}${
          district !== undefined ? `-0${district}` : ''
        }-regular-general`,
  identity: {
    cycle,
    office,
    state,
    stateName,
    ...(district !== undefined ? { district } : {}),
    election: 'regular',
    round: cycle === 2028 ? 'Nov 7, 2028 general' : `Nov ${cycle} general`,
    candidateNames: [],
  },
  payload: {
    ...partyEntry(state, stateName).payload!,
    question: `Which party will win the ${cycle} ${stateName} ${office} election?`,
    closeTime: Date.UTC(cycle, 10, 8, 12),
  },
  dashboard: {
    list: `${office === 'governor' ? 'governors' : office}${cycle}`,
    key: state,
  },
})
const partyMulti = (id: string, question: string): MarketLike => ({
  id,
  question,
  outcomeType: 'MULTIPLE_CHOICE',
  answers: [
    { id: 'a', text: 'Democrats' },
    { id: 'b', text: 'Republicans' },
    { id: 'c', text: 'Other' },
  ],
})
const binary = (id: string, question: string): MarketLike => ({
  id,
  question,
  outcomeType: 'BINARY',
})
const verdict = (entry: ManifestEntry, m: MarketLike) =>
  classifyExistingMarket(entry, m).verdict

describe('generic 2028+ classification', () => {
  const national = genericEntry('president', 'US', 'United States')
  const pa = genericEntry('president', 'PA', 'Pennsylvania')
  const dc = genericEntry('president', 'DC', 'District of Columbia')
  const ne = genericEntry('president', 'NE', 'Nebraska')
  const ne2 = genericEntry('president', 'NE', 'Nebraska', 2)
  const houseNe2 = genericEntry('house', 'NE', 'Nebraska', 2)
  const senateGa = genericEntry('senate', 'GA', 'Georgia')

  test('the national market matches party multis about the 2028 presidency only', () => {
    expect(
      verdict(
        national,
        partyMulti('1', 'Which party will win the 2028 presidential election?')
      )
    ).toBe('equivalent')
    expect(
      verdict(
        national,
        partyMulti(
          '2',
          'Which party will win the 2028 presidential election in Nebraskas 2nd Congressional District?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        national,
        partyMulti(
          '3',
          'Which party will win the 2028 presidential election in DC?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        national,
        partyMulti('4', 'Which party will win the 2032 presidential election?')
      )
    ).toBe('unrelated')
    expect(
      verdict(
        national,
        partyMulti(
          '5',
          'Which party will win the popular vote in the 2028 Presidential election?'
        )
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        national,
        partyMulti(
          '6',
          'Which party will win the 2028 presidential election? / Will prediction markets be legal in 2030?'
        )
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        national,
        binary(
          '7',
          'Will Democrats win all 7 swing states in the 2028 presidential election?'
        )
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        national,
        binary(
          '8',
          'In 2028, will democrats have a major presidential candidate from the centrist wing of the party?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        national,
        binary(
          '9',
          'Will JD Vance refuse to certify any electoral college votes in the 2028 election?'
        )
      )
    ).toBe('unrelated')
  })

  test('binary party markets are held for review after 2026, not treated as equivalent', () => {
    expect(
      verdict(
        national,
        binary('10', 'Will a Democrat win the 2028 Presidential Election?')
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        senateGa,
        binary('11', 'Democrats win 2028 Georgia Senate election?')
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        partyEntry('GA', 'Georgia'),
        binary('12', 'Will a Democrat win the 2026 Georgia governor election?')
      )
    ).toBe('equivalent')
  })

  test('state and district presidential markets', () => {
    expect(
      verdict(
        pa,
        partyMulti(
          '13',
          'Which party will win the 2028 presidential election in Pennsylvania?'
        )
      )
    ).toBe('equivalent')
    expect(
      verdict(
        pa,
        binary(
          '14',
          'Will the 2028 Democratic Candidate for President win Pennsylvania?'
        )
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        pa,
        binary('15', 'Will Georgia be bluer than Pennsylvania in 2028?')
      )
    ).toBe('unrelated')
    expect(
      verdict(
        dc,
        partyMulti(
          '16',
          'Which party will win the 2028 presidential election in DC?'
        )
      )
    ).toBe('equivalent')
    expect(
      verdict(
        ne,
        partyMulti(
          '17',
          'Which party will win the 2028 presidential election in Nebraskas 2nd Congressional District?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        ne2,
        partyMulti(
          '18',
          'Which party will win the 2028 presidential election in Nebraskas 2nd Congressional District?'
        )
      )
    ).toBe('equivalent')
    expect(
      verdict(
        ne2,
        partyMulti(
          '19',
          'Which party will win the 2028 presidential election in Nebraska?'
        )
      )
    ).toBe('unrelated')
  })

  test('a House entry ignores presidential elector-district markets and Senate markets', () => {
    expect(
      verdict(
        houseNe2,
        partyMulti(
          '20',
          'Which party will win the 2028 presidential election in Nebraskas 2nd Congressional District?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        houseNe2,
        partyMulti(
          '21',
          'Which party will win the 2028 U.S. House election in NE-2?'
        )
      )
    ).toBe('equivalent')
    expect(
      verdict(
        houseNe2,
        partyMulti(
          '22',
          'Which party will win the 2028 Nebraska Senate election?'
        )
      )
    ).toBe('unrelated')
  })

  test('a Senate entry accepts a party multi for the seat and holds candidate markets for review', () => {
    expect(
      verdict(
        senateGa,
        partyMulti('23', 'Who will win the 2028 senate election in Georgia?')
      )
    ).toBe('equivalent')
    expect(
      verdict(
        senateGa,
        binary(
          '24',
          'Will Raphael Warnock win the 2028 Georgia Senate election?'
        )
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        senateGa,
        partyMulti('25', '2028 Georgia Senate Democratic Primary Winner?')
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        senateGa,
        partyMulti(
          '26',
          'Which party will win the 2026 Georgia Senate election?'
        )
      )
    ).toBe('unrelated')
  })

  test('validation ties the race key to the identity for every cycle', () => {
    const ok = genericEntry('senate', 'GA', 'Georgia')
    expect(validateManifest(manifest([ok]), NOW)).toEqual([])
    const wrongCycle = { ...ok, raceKey: '2032-senate-GA-regular-general' }
    expect(validateManifest(manifest([wrongCycle]), NOW).join(' ')).toMatch(
      /cycle 2032 must match identity.cycle 2028/
    )
    const candidatePresident = {
      ...genericEntry('president', 'US', 'United States'),
      proposition: 'candidate' as const,
    }
    expect(
      validateManifest(manifest([candidatePresident]), NOW).join(' ')
    ).toMatch(/resolve by party/)
  })

  test('a 2030 midterm entry is tied to 2030: other years are other elections', () => {
    const me = genericEntry('senate', 'ME', 'Maine', undefined, 2030)
    const ga = genericEntry('governor', 'GA', 'Georgia', undefined, 2030)
    expect(validateManifest(manifest([me, ga]), NOW)).toEqual([])
    expect(
      validateManifest(
        manifest([{ ...ga, raceKey: '2026-governor-GA-regular-general' }]),
        NOW
      ).join(' ')
    ).toMatch(/cycle 2026 must match identity.cycle 2030/)
    expect(
      verdict(
        me,
        partyMulti('27', 'Which party will win the 2030 Maine Senate election?')
      )
    ).toBe('equivalent')
    expect(
      verdict(
        me,
        partyMulti('28', 'Which party will win the 2026 Maine Senate election?')
      )
    ).toBe('unrelated')
    expect(
      verdict(
        ga,
        partyMulti(
          '29',
          'Which party will win the 2030 Georgia governor election?'
        )
      )
    ).toBe('equivalent')
    expect(
      verdict(
        ga,
        partyMulti(
          '30',
          'Which party will win the 2026 Georgia governor election?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        ga,
        binary('31', 'Will a Democrat win the 2030 Georgia governor race?')
      )
    ).toBe('ambiguous')
  })

  // A state's popular vote (who gets the most votes there) and its electoral
  // votes are different propositions (Tod, 2026-11-05).
  const popularEntry = (
    state: string,
    stateName: string,
    cycle = 2028
  ): ManifestEntry => {
    const e = genericEntry('president', state, stateName, undefined, cycle)
    return {
      ...e,
      raceKey: `${cycle}-president-${state}-popular-vote`,
      proposition: 'popular-vote-party',
      payload: {
        ...e.payload!,
        question: `Which party will win the popular vote in ${stateName} in the ${cycle} presidential election?`,
      },
      dashboard: { list: `presidentPopular${cycle}`, key: state },
    }
  }

  test('a state popular-vote market and the electoral markets are never duplicates of each other', () => {
    const paPopular = popularEntry('PA', 'Pennsylvania')
    const ourElectoral = partyMulti(
      '40',
      'Which party will win Pennsylvania in the 2028 presidential election?'
    )
    const ourPopular = partyMulti(
      '41',
      'Which party will win the popular vote in Pennsylvania in the 2028 presidential election?'
    )
    // Each entry recognises a market of its own kind...
    expect(verdict(pa, ourElectoral)).toBe('equivalent')
    expect(verdict(paPopular, ourPopular)).toBe('equivalent')
    // ...and never one of the other kind, in either direction.
    expect(classifyExistingMarket(paPopular, ourElectoral)).toEqual({
      verdict: 'ambiguous',
      reason: 'not about the popular vote; ours is the popular vote',
    })
    expect(classifyExistingMarket(pa, ourPopular)).toEqual({
      verdict: 'ambiguous',
      reason: 'a popular-vote market; ours follows the electoral outcome',
    })
    // Under the 2028+ policy a related market, even our own, never skips or
    // holds an entry.
    const policy = { blockingCreators: ['ManifoldPolitics'] }
    for (const [entry, m] of [
      [paPopular, ourElectoral],
      [pa, ourPopular],
    ] as const)
      expect(
        duplicateDecision(policy, [
          {
            verdict: classifyExistingMarket(entry, m).verdict as 'ambiguous',
            creatorUsername: 'ManifoldPolitics',
          },
        ]).action
      ).toBe('create')
    // The national and district electoral markets aren't the state's
    // popular vote, and the national market is unchanged.
    expect(
      verdict(
        paPopular,
        partyMulti('42', 'Which party will win the 2028 presidential election?')
      )
    ).toBe('unrelated')
    expect(
      verdict(
        popularEntry('NE', 'Nebraska'),
        partyMulti(
          '43',
          'Which party will win the 2028 presidential election in Nebraskas 2nd Congressional District?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        national,
        partyMulti(
          '44',
          'Which party will win the popular vote in the 2028 Presidential election?'
        )
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        national,
        partyMulti(
          '45',
          'Which party will win the popular vote in Pennsylvania in the 2028 presidential election?'
        )
      )
    ).toBe('unrelated')
  })

  test('popular-vote wording: other phrasings, states, years and derivatives', () => {
    const paPopular = popularEntry('PA', 'Pennsylvania')
    // "most votes" is popular-vote wording too; no "president" needed.
    expect(
      verdict(
        paPopular,
        partyMulti(
          '46',
          'Which party will get the most votes in Pennsylvania in 2028?'
        )
      )
    ).toBe('equivalent')
    expect(
      verdict(
        paPopular,
        partyMulti(
          '47',
          'Which party will win the popular vote in Ohio in the 2028 presidential election?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        paPopular,
        partyMulti(
          '48',
          'Which party will win the popular vote in Pennsylvania in the 2032 presidential election?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        paPopular,
        partyMulti('49', 'Which party will win the 2028 national popular vote?')
      )
    ).toBe('unrelated')
    expect(
      verdict(
        paPopular,
        partyMulti(
          '50',
          'Who will win the popular vote in the 2028 Pennsylvania Senate race?'
        )
      )
    ).toBe('unrelated')
    expect(
      verdict(
        paPopular,
        binary(
          '51',
          'Will a Democrat win the popular vote in Pennsylvania in 2028?'
        )
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        paPopular,
        partyMulti(
          '52',
          'Pennsylvania 2028 presidential popular vote margin over 5 points?'
        )
      )
    ).toBe('ambiguous')
    expect(
      verdict(
        popularEntry('DC', 'District of Columbia'),
        partyMulti(
          '53',
          'Which party will win the popular vote in DC in the 2028 presidential election?'
        )
      )
    ).toBe('equivalent')
  })

  test('validation keeps popular-vote entries statewide and their keys apart', () => {
    const ok = popularEntry('PA', 'Pennsylvania')
    expect(validateManifest(manifest([ok]), NOW)).toEqual([])
    // Both PA markets can sit in one manifest: distinct keys and ids.
    expect(validateManifest(manifest([pa, ok]), NOW)).toEqual([])
    const errors = (entry: ManifestEntry) =>
      validateManifest(manifest([entry]), NOW).join(' ')
    expect(errors({ ...ok, raceKey: '2028-president-PA-general' })).toMatch(
      /must end in -popular-vote/
    )
    expect(
      errors({ ...pa, raceKey: '2028-president-PA-popular-vote' })
    ).toMatch(/only a popular-vote-party entry/)
    expect(
      errors({
        ...ok,
        raceKey: '2028-president-US-popular-vote',
        identity: { ...ok.identity, state: 'US', stateName: 'United States' },
      })
    ).toMatch(/not a district or the US/)
    expect(
      errors({
        ...ok,
        raceKey: '2028-president-NE-popular-vote',
        identity: {
          ...ok.identity,
          state: 'NE',
          stateName: 'Nebraska',
          district: 2,
        },
      })
    ).toMatch(/not a district or the US/)
    expect(
      errors({
        ...genericEntry('senate', 'PA', 'Pennsylvania'),
        raceKey: '2028-senate-PA-popular-vote',
        proposition: 'popular-vote-party',
      })
    ).toMatch(/not a district or the US/)
  })
})

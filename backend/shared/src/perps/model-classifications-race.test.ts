import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'

jest.mock('common/perps/lab-share', () => ({}))
jest.mock('common/perps/open-weight-models', () => ({
  OPEN_WEIGHT_MODELS: {},
  UNCLASSIFIED_GRACE_WINDOW_MS: 2 * 24 * 60 * 60 * 1000,
  basePermaslug: (slug: string) => slug.split(':', 1)[0],
  isCompositeSlug: () => false,
  isValidPermaslug: (slug: string) => /^[^/\s]+\/[^/\s]+$/.test(slug),
}))
jest.mock('shared/supabase/init', () => ({}))
jest.mock('shared/utils', () => ({
  isProd: () => true,
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('shared/huggingface', () => ({
  verifyHuggingFaceWeights: jest.fn(),
  logHuggingFaceVerification: jest.fn(),
}))
jest.mock('shared/perps/classify-model-agent', () => ({
  classifyModelWithAgent: jest.fn(),
}))
jest.mock('shared/perps/classify-lab-agent', () => ({}))
jest.mock('shared/perps/lab-classifications', () => ({}))
jest.mock('shared/openrouter-tokens', () => ({}))

import { verifyHuggingFaceWeights } from 'shared/huggingface'
import { classifyModelWithAgent } from 'shared/perps/classify-model-agent'
import { log } from 'shared/utils'
import { recheckProvisionalModels } from '../../../scheduler/src/jobs/update-model-classifications'
import {
  getProvisionalClassifications,
  openProvisionalClassification,
  recordAgentRecommendation,
  upsertClassification,
} from './model-classifications'

// Opt-in integration test. Use only a disposable localhost database named
// pr4157_test; no application credentials or Supabase client are loaded.
// CLASSIFICATION_TEST_DB_URL=postgres://...@127.0.0.1:PORT/pr4157_test
const databaseUrl = process.env.CLASSIFICATION_TEST_DB_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/pr4157_test'
  )
    throw new Error('classification race tests require localhost/pr4157_test')
}
const integration = databaseUrl ? describe : describe.skip

integration('provisional auto-open against PostgreSQL', () => {
  const pgp = pgPromise()
  // Match the application's lossless timestamp parsers.
  pgp.pg.types.setTypeParser(1184, (value) => value)
  const schema = `classification_race_${process.pid}_${Date.now()}`
  const scopedUrl = new URL(databaseUrl ?? 'postgres://localhost/pr4157_test')
  scopedUrl.searchParams.set('options', `-c search_path=${schema}`)
  scopedUrl.searchParams.set('application_name', schema)
  const pg = pgp(scopedUrl.toString())
  const slug = 'race-test/preview'
  const catalog = [
    {
      permaslug: slug,
      name: 'Preview',
      huggingFaceId: 'lab/old',
      description: null,
      listedAt: null,
    },
  ]
  const verified = {
    confirmed: true as const,
    repo: 'lab/old',
    evidence: {
      repo: 'lab/old',
      gated: false,
      weightFileCount: 1,
      sampleWeightFiles: ['model.safetensors'],
      checkedAt: '2026-10-16T00:00:00Z',
    },
  }
  const read = () =>
    pg.oneOrNone(
      'select * from model_classifications where permaslug = $1',
      slug
    )
  const decide = (open: boolean, provisional = false) =>
    upsertClassification(pg, {
      permaslug: slug,
      open,
      provisional,
      weights: open ? 'human/new-repo' : null,
      source: 'admin',
      classifiedBy: 'new-operator',
      evidence: {
        summary: 'new human evidence',
        url: 'https://example.test/new',
      },
    })

  beforeAll(async () => {
    await pg.none('create schema $1:name', schema)
    for (const migration of [
      '2026081301_model_classifications.sql',
      '2026090401_openrouter_lab_classifications.sql',
      '2026100601_classification_provisional.sql',
    ])
      await pg.none(
        readFileSync(
          resolve(__dirname, '../../../supabase/migrations', migration),
          'utf8'
        )
      )
  })

  afterAll(async () => {
    await pg.none('drop schema $1:name cascade', schema)
    await pg.$pool.end()
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    await pg.none('truncate model_classifications')
    await upsertClassification(pg, {
      permaslug: slug,
      open: false,
      provisional: true,
      source: 'admin',
      classifiedBy: 'original-operator',
      evidence: { summary: 'promised later', history: [{ earlier: true }] },
    })
    await pg.none(
      `update model_classifications
       set classified_at = now() - interval '8 days',
           updated_time = '2026-10-01 00:00:00.123456+00'`
    )
    jest.mocked(verifyHuggingFaceWeights).mockResolvedValue(verified)
  })

  const duringVerification = async (change: () => Promise<unknown>) => {
    let started!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => (started = resolve))
    const resume = new Promise<void>((resolve) => (release = resolve))
    jest.mocked(verifyHuggingFaceWeights).mockImplementationOnce(async () => {
      started()
      await resume
      return verified
    })
    const sweep = recheckProvisionalModels(pg, catalog)
    try {
      await entered
      await change()
      const expected = await read()
      release()
      await sweep
      expect(await read()).toEqual(expected)
      expect(log.warn).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('provisional re-check: 0 flipped open')
      )
      expect(classifyModelWithAgent).not.toHaveBeenCalled()
    } finally {
      release()
      await sweep
    }
  }

  test.each([false, true])(
    'preserves a newer firm human verdict (open=%s) during verification',
    async (open) => {
      await duringVerification(() => decide(open))
    }
  )

  test('does not defeat a newly restarted provisional watch', async () => {
    await duringVerification(async () => {
      await decide(false)
      await decide(false, true)
    })
  })

  test('does not recreate a deleted row', async () => {
    await duringVerification(() =>
      pg.none('delete from model_classifications where permaslug = $1', slug)
    )
  })

  test('preserves newer research evidence and cooldown', async () => {
    await duringVerification(() =>
      recordAgentRecommendation(pg, slug, 'closed', { agentReasoning: 'new' })
    )
  })

  test('uncontended flip archives the actual prior decision exactly once', async () => {
    const prior = await read()
    const [snapshot] = await getProvisionalClassifications(pg)
    expect(snapshot.updated_time).toContain('.123456')
    await recheckProvisionalModels(pg, catalog)
    const current = await read()
    expect(current).toMatchObject({
      open: true,
      provisional: false,
      source: 'auto',
      weights: 'lab/old',
      classified_by: null,
    })
    expect(current.evidence.history).toHaveLength(2)
    expect(current.evidence.history[0]).toEqual({ earlier: true })
    expect(current.evidence.history[1]).toMatchObject({
      open: false,
      provisional: true,
      classifiedBy: 'original-operator',
      evidence: { summary: 'promised later' },
    })
    expect(new Date(current.evidence.history[1].classifiedAt).getTime()).toBe(
      new Date(prior.classified_at).getTime()
    )
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('provisional re-check: 1 flipped open')
    )
    expect(
      await openProvisionalClassification(pg, snapshot, 'lab/old', {})
    ).toBe(false)
    expect(await read()).toEqual(current)
  })

  test('evidence also detects a restarted watch with an identical timestamp', async () => {
    await pg.tx(async (tx) => {
      await upsertClassification(tx, {
        permaslug: slug,
        open: false,
        provisional: true,
        source: 'admin',
      })
      const [snapshot] = await getProvisionalClassifications(tx)
      await upsertClassification(tx, {
        permaslug: slug,
        open: false,
        provisional: true,
        source: 'admin',
      })
      const [newer] = await getProvisionalClassifications(tx)
      expect(newer.updated_time).toBe(snapshot.updated_time)
      expect(newer.evidence).not.toEqual(snapshot.evidence)
      expect(
        await openProvisionalClassification(tx, snapshot, 'lab/old', {})
      ).toBe(false)
    })
  })

  test('rechecks the predicate after waiting for a concurrent writer lock', async () => {
    const [snapshot] = await getProvisionalClassifications(pg)
    let attempted!: Promise<boolean>
    await pg.tx(async (tx) => {
      await upsertClassification(tx, {
        permaslug: slug,
        open: true,
        weights: 'human/new-repo',
        source: 'admin',
        classifiedBy: 'new-operator',
        evidence: { summary: 'human holds the row lock' },
      })
      attempted = openProvisionalClassification(pg, snapshot, 'lab/old', {})
      // Observe the second connection waiting on the locked tuple before commit.
      for (let attempt = 0; ; attempt++) {
        const waiting = await pg.one<{ count: number }>(
          `select count(*)::int as count from pg_stat_activity
           where application_name = $1 and wait_event_type = 'Lock'
             and query like 'update model_classifications%'
             and pid <> pg_backend_pid()`,
          schema
        )
        if (waiting.count > 0) break
        if (attempt >= 100) throw new Error('conditional update did not wait')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    })
    expect(await attempted).toBe(false)
    expect(await read()).toMatchObject({
      open: true,
      weights: 'human/new-repo',
      classified_by: 'new-operator',
      evidence: { summary: 'human holds the row lock' },
    })
  })
})

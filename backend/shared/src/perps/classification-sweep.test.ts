jest.mock('common/perps/lab-share', () => ({
  authorOfPermaslug: (slug: string) => slug.split('/')[0],
}))
jest.mock('common/perps/open-weight-models', () => ({
  OPEN_WEIGHT_MODELS: {},
  UNCLASSIFIED_GRACE_WINDOW_MS: 2 * 24 * 60 * 60 * 1000,
  basePermaslug: (slug: string) => slug.split(':', 1)[0],
  isCompositeSlug: () => false,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
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
jest.mock('shared/perps/classify-lab-agent', () => ({
  classifyLabSubjectWithAgent: jest.fn(),
}))
jest.mock('shared/perps/model-classifications', () => ({
  ...jest.requireActual('shared/perps/model-classifications'),
  getProvisionalClassifications: jest.fn(),
  openProvisionalClassification: jest.fn(),
  recordAgentRecommendation: jest.fn(),
  recordPendingModels: jest.fn(),
}))
jest.mock('shared/perps/lab-classifications', () => ({
  ...jest.requireActual('shared/perps/lab-classifications'),
  getLabResearchCandidates: jest.fn(),
  recordLabAgentRecommendation: jest.fn(),
  recordPendingLabSubjectsFromCatalog: jest.fn(),
  resolveLabClassifications: jest.fn(),
}))
jest.mock('shared/openrouter-tokens', () => ({
  fetchOpenRouterCatalog: jest.fn(),
}))

import { verifyHuggingFaceWeights } from 'shared/huggingface'
import { fetchOpenRouterCatalog } from 'shared/openrouter-tokens'
import { classifyModelWithAgent } from 'shared/perps/classify-model-agent'
import { classifyLabSubjectWithAgent } from 'shared/perps/classify-lab-agent'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { updateModelClassifications } from '../../../scheduler/src/jobs/update-model-classifications'
import {
  ProvisionalClassificationRow,
  getProvisionalClassifications,
  openProvisionalClassification,
  recordAgentRecommendation,
} from './model-classifications'
import {
  LabClassificationRow,
  getLabResearchCandidates,
  recordLabAgentRecommendation,
} from './lab-classifications'

describe('classification sweep failure isolation', () => {
  const pg = { manyOrNone: jest.fn() } as unknown as ReturnType<
    typeof createSupabaseDirectClient
  >
  const old = '2026-01-01T00:00:00.000Z'
  const watched = (
    permaslug = 'test/preview'
  ): ProvisionalClassificationRow => ({
    permaslug,
    open: false,
    weights: null,
    provisional: true,
    source: 'admin',
    evidence: {
      agentRecommendation: 'open',
      agentRanAt: old,
      agentProposedWeights: 'lab/weights',
    },
    first_seen: old,
    first_ranked_at: old,
    classified_at: old,
    classified_by: 'operator',
    updated_time: old,
  })
  const lab = (provisional = true): LabClassificationRow => ({
    subject_type: 'model',
    subject_slug: 'test/preview',
    is_chinese: provisional ? false : null,
    provisional,
    source: 'admin',
    evidence: { agentRecommendation: 'chinese', agentRanAt: old },
    first_seen: old,
    first_ranked_at: old,
    classified_at: provisional ? old : null,
    classified_by: 'operator',
    updated_time: old,
  })
  const entry = (permaslug: string) => ({
    permaslug,
    name: permaslug,
    huggingFaceId: 'lab/weights',
    description: null,
    listedAt: null,
  })
  const unresolved = {
    verdict: 'unresolved' as const,
    reasoning: 'API offline',
  }

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(createSupabaseDirectClient).mockReturnValue(pg)
    jest.mocked(pg.manyOrNone).mockResolvedValue([])
    jest.mocked(fetchOpenRouterCatalog).mockResolvedValue([])
    jest.mocked(getProvisionalClassifications).mockResolvedValue([])
    jest.mocked(getLabResearchCandidates).mockResolvedValue([lab()])
    jest.mocked(classifyModelWithAgent).mockResolvedValue({
      permaslug: 'test/preview',
      verdict: unresolved,
      searches: [],
      transient: true,
    })
    jest.mocked(classifyLabSubjectWithAgent).mockResolvedValue({
      subjectType: 'model',
      subjectSlug: 'test/preview',
      verdict: unresolved,
      searches: [],
      transient: true,
    })
    jest.mocked(openProvisionalClassification).mockResolvedValue(true)
  })

  test('transient model research preserves contradiction and remains retryable', async () => {
    const row = watched()
    const prior = JSON.parse(JSON.stringify(row))
    jest.mocked(getProvisionalClassifications).mockResolvedValue([row])
    await updateModelClassifications()
    await updateModelClassifications()
    expect(classifyModelWithAgent).toHaveBeenCalledTimes(2)
    expect(recordAgentRecommendation).not.toHaveBeenCalled()
    expect(openProvisionalClassification).not.toHaveBeenCalled()
    expect(row).toEqual(prior)
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('test/preview: transient re-check failure')
    )
  })

  test('transient lab research preserves contradiction and remains retryable', async () => {
    const row = lab()
    const prior = JSON.parse(JSON.stringify(row))
    jest.mocked(getLabResearchCandidates).mockResolvedValue([row])
    await updateModelClassifications()
    await updateModelClassifications()
    expect(classifyLabSubjectWithAgent).toHaveBeenCalledTimes(2)
    expect(recordLabAgentRecommendation).not.toHaveBeenCalled()
    expect(row).toEqual(prior)
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('model test/preview: transient re-check failure')
    )
  })

  test('pending lab failures retain existing diagnostics without a cooldown', async () => {
    jest.mocked(getLabResearchCandidates).mockResolvedValue([lab(false)])
    await updateModelClassifications()
    expect(recordLabAgentRecommendation).toHaveBeenCalledWith(
      pg,
      'model',
      'test/preview',
      expect.objectContaining({ agentRecommendation: null }),
      false
    )
  })

  test('completed unresolved research still records evidence and starts cooldowns', async () => {
    jest.mocked(getProvisionalClassifications).mockResolvedValue([watched()])
    jest.mocked(classifyModelWithAgent).mockResolvedValue({
      permaslug: 'test/preview',
      verdict: unresolved,
      searches: [],
    })
    jest.mocked(classifyLabSubjectWithAgent).mockResolvedValue({
      subjectType: 'model',
      subjectSlug: 'test/preview',
      verdict: unresolved,
      searches: [],
    })
    await updateModelClassifications()
    expect(recordAgentRecommendation).toHaveBeenCalledWith(
      pg,
      'test/preview',
      null,
      expect.objectContaining({ agentReasoning: 'API offline' })
    )
    expect(recordLabAgentRecommendation).toHaveBeenCalledWith(
      pg,
      'model',
      'test/preview',
      expect.objectContaining({ agentRecommendation: null }),
      true
    )
  })

  test('a malformed HF response preserves its row and allows later rows and labs', async () => {
    const first = watched('test/first')
    const second = watched('test/second')
    jest.mocked(pg.manyOrNone).mockResolvedValue([first, second])
    jest
      .mocked(fetchOpenRouterCatalog)
      .mockResolvedValue([entry(first.permaslug), entry(second.permaslug)])
    jest
      .mocked(getProvisionalClassifications)
      .mockResolvedValue([first, second])
    jest
      .mocked(verifyHuggingFaceWeights)
      .mockRejectedValueOnce(new SyntaxError('HTML instead of JSON'))
      .mockResolvedValueOnce({
        confirmed: true,
        repo: 'lab/weights',
        evidence: {
          repo: 'lab/weights',
          gated: false,
          weightFileCount: 1,
          sampleWeightFiles: ['model.safetensors'],
          checkedAt: old,
        },
      })
    await updateModelClassifications()
    expect(openProvisionalClassification).toHaveBeenCalledTimes(1)
    expect(openProvisionalClassification).toHaveBeenCalledWith(
      pg,
      second,
      'lab/weights',
      expect.any(Object)
    )
    expect(recordAgentRecommendation).not.toHaveBeenCalled()
    expect(classifyModelWithAgent).not.toHaveBeenCalled()
    expect(classifyLabSubjectWithAgent).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('test/first: repo verification failed')
    )
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('provisional re-check: 1 flipped open')
    )
  })

  test('an older pending-stage verification failure does not suppress new stages', async () => {
    jest
      .mocked(fetchOpenRouterCatalog)
      .mockResolvedValue([entry('test/pending')])
    jest
      .mocked(verifyHuggingFaceWeights)
      .mockRejectedValue(new Error('HF down'))
    jest.mocked(getProvisionalClassifications).mockResolvedValue([watched()])
    await updateModelClassifications()
    expect(classifyModelWithAgent).toHaveBeenCalledTimes(1)
    expect(classifyLabSubjectWithAgent).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('pending classification failed')
    )
  })

  test('a failed watch-list stage does not suppress lab research', async () => {
    jest
      .mocked(getProvisionalClassifications)
      .mockRejectedValue(new Error('DB'))
    await updateModelClassifications()
    expect(classifyLabSubjectWithAgent).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('provisional re-check failed')
    )
  })
})

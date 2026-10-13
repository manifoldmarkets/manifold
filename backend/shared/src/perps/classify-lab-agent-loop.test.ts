jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(),
}))

import Anthropic from '@anthropic-ai/sdk'
import { classifyLabSubjectWithAgent } from './classify-lab-agent'

const subject = {
  subjectType: 'model' as const,
  subjectSlug: 'stealth/new-preview',
  openRouterNames: [],
  descriptions: [],
  relatedPermaslugs: [],
  inCatalog: true,
  provisional: true,
}

const searchResponse = (count: number, stopReason = 'pause_turn') => ({
  stop_reason: stopReason,
  content: Array.from({ length: count }, (_, index) => [
    {
      type: 'server_tool_use',
      id: `search-${index}`,
      name: 'web_search',
      input: { query: `publisher reveal ${index}` },
    },
    {
      type: 'web_search_tool_result',
      tool_use_id: `search-${index}`,
      content: [],
    },
  ]).flat(),
})

const originalKey = process.env.ANTHROPIC_API_KEY
const create = jest.fn()

beforeEach(() => {
  // The SDK constructor is mocked: this sentinel can never make a live call.
  process.env.ANTHROPIC_API_KEY = 'test-only'
  create.mockReset()
  ;(Anthropic as unknown as jest.Mock).mockImplementation(() => ({
    messages: { create },
  }))
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = originalKey
})

test.each(['pause_turn', 'end_turn'])(
  'keeps a single search budget across %s continuations',
  async (stopReason) => {
    create
      .mockResolvedValueOnce(searchResponse(4, stopReason))
      .mockResolvedValueOnce(searchResponse(2))
    const result = await classifyLabSubjectWithAgent(subject)
    expect(create).toHaveBeenCalledTimes(2)
    expect(
      create.mock.calls.map(([request]) => request.tools[0].max_uses)
    ).toEqual([6, 2])
    expect(result.searches).toHaveLength(6)
    expect(result.verdict.verdict).toBe('unresolved')
    expect(result.verdict.reasoning).toContain('search budget exhausted')
    expect(result.transient).toBe(false)
  }
)

test('accepts a submission alongside the final allowed search', async () => {
  const response = searchResponse(6, 'tool_use')
  create.mockResolvedValue({
    ...response,
    content: [
      ...response.content,
      {
        type: 'tool_use',
        id: 'submit',
        name: 'submit_attribution',
        input: {
          verdict: 'unattributed',
          reasoning: 'no official reveal found',
        },
      },
    ],
  })
  const result = await classifyLabSubjectWithAgent(subject)
  expect(create).toHaveBeenCalledTimes(1)
  expect(result.verdict.verdict).toBe('unattributed')
})

test('tool-name recovery does not reset the remaining search allowance', async () => {
  const response = searchResponse(4, 'tool_use')
  create
    .mockResolvedValueOnce({
      ...response,
      content: [
        ...response.content,
        { type: 'tool_use', id: 'unknown', name: 'fetch_page', input: {} },
      ],
    })
    .mockResolvedValueOnce(searchResponse(2))
  const result = await classifyLabSubjectWithAgent(subject)
  expect(create).toHaveBeenCalledTimes(2)
  expect(
    create.mock.calls.map(([request]) => request.tools[0].max_uses)
  ).toEqual([6, 2])
  expect(result.searches).toHaveLength(6)
})

test('an exhausted budget of failed searches still permits an outage retry', async () => {
  const response = searchResponse(6)
  create.mockResolvedValue({
    ...response,
    content: response.content.map((block) =>
      block.type === 'web_search_tool_result'
        ? { ...block, content: { error_code: 'unavailable' } }
        : block
    ),
  })
  const result = await classifyLabSubjectWithAgent(subject)
  expect(create).toHaveBeenCalledTimes(1)
  expect(result.verdict.verdict).toBe('unresolved')
  expect(result.transient).toBe(true)
})

test.each([0, 5])(
  'a pause with %i failed searches and the rest unfinished does not start cooldown',
  async (failedCount) => {
    const response = searchResponse(6)
    create.mockResolvedValue({
      ...response,
      content: [
        ...response.content.filter((block) => block.type === 'server_tool_use'),
        ...Array.from({ length: failedCount }, (_, index) => ({
          type: 'web_search_tool_result',
          tool_use_id: `search-${index}`,
          content: { error_code: 'unavailable' },
        })),
      ],
    })
    const result = await classifyLabSubjectWithAgent(subject)
    expect(create).toHaveBeenCalledTimes(1)
    expect(result.searches).toHaveLength(6)
    expect(
      result.searches.filter((search) => search.completed === false)
    ).toHaveLength(6 - failedCount)
    expect(result.verdict.verdict).toBe('unresolved')
    expect(result.transient).toBe(true)
  }
)

test('treats HTTP-200 search errors as transient without any network call', async () => {
  create.mockResolvedValue({
    stop_reason: 'tool_use',
    content: [
      {
        type: 'server_tool_use',
        id: 'failed-search',
        name: 'web_search',
        input: { query: 'publisher reveal' },
      },
      {
        type: 'web_search_tool_result',
        tool_use_id: 'failed-search',
        content: {
          type: 'web_search_tool_result_error',
          error_code: 'unavailable',
        },
      },
      {
        type: 'tool_use',
        id: 'submit',
        name: 'submit_attribution',
        input: { verdict: 'unattributed', reasoning: 'nothing found' },
      },
    ],
  })
  const result = await classifyLabSubjectWithAgent(subject)
  expect(result.searches[0].error).toBe('unavailable')
  expect(result.verdict.verdict).toBe('unresolved')
  expect(result.transient).toBe(true)
})

jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('shared/utils', () => ({ log: { error: jest.fn() } }))

import Anthropic from '@anthropic-ai/sdk'
import { promptClaude } from './claude'

const stream = jest.fn()
const abort = jest.fn()
const originalKey = process.env.ANTHROPIC_API_KEY
const textEvent = (text: string) => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
})
const stopEvent = (stop_reason: string) => ({
  type: 'message_delta',
  delta: { stop_reason },
})
const respond = (events: unknown[]) => {
  stream.mockReturnValue(
    Object.assign(
      (async function* () {
        for (const event of events) yield event
      })(),
      { abort }
    )
  )
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers()
  process.env.ANTHROPIC_API_KEY = 'mock-key-not-a-credential'
  jest
    .mocked(Anthropic)
    .mockImplementation(
      () => ({ messages: { stream } } as unknown as Anthropic)
    )
})

afterEach(() => {
  jest.useRealTimers()
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = originalKey
})

it('collects only answer text, supplies effort and clears its deadline', async () => {
  respond([
    {
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: 'private' },
    },
    textEvent('y'),
    textEvent('es'),
    stopEvent('end_turn'),
  ])
  await expect(promptClaude('classify', { effort: 'low' })).resolves.toBe('yes')
  expect(Anthropic).toHaveBeenCalledWith({
    apiKey: 'mock-key-not-a-credential',
    timeout: 30_000,
    maxRetries: 0,
  })
  expect(stream).toHaveBeenCalledWith(
    expect.objectContaining({ output_config: { effort: 'low' } })
  )
  expect(stream.mock.calls[0][0]).not.toHaveProperty('temperature')
  expect(jest.getTimerCount()).toBe(0)
})

it.each(['refusal', 'max_tokens', 'pause_turn'])(
  'rejects %s even when partial text is valid JSON',
  async (reason) => {
    respond([textEvent('["partial"]'), stopEvent(reason)])
    await expect(promptClaude('classify')).rejects.toThrow(
      `stop_reason: ${reason}`
    )
    expect(jest.getTimerCount()).toBe(0)
    expect(abort).toHaveBeenCalled()
  }
)

it('rejects an empty text answer after thinking', async () => {
  respond([textEvent('  '), stopEvent('end_turn')])
  await expect(promptClaude('classify')).rejects.toThrow('empty response')
})

it('aborts a stalled stream at the deadline rather than leaving it running', async () => {
  let rejectNext: (error: Error) => void = () => undefined
  stream.mockReturnValue({
    [Symbol.asyncIterator]() {
      return this
    },
    next: () =>
      new Promise((_resolve, reject) => {
        rejectNext = reject
      }),
    abort: jest.fn(() => rejectNext(new Error('stream aborted'))),
  })
  const result = promptClaude('classify')
  const rejected = expect(result).rejects.toThrow('stream aborted')
  jest.advanceTimersByTime(29_999)
  expect(stream.mock.results[0].value.abort).not.toHaveBeenCalled()
  jest.advanceTimersByTime(1)
  await rejected
  expect(stream.mock.results[0].value.abort).toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
})

it('fails before creating a client if the key is missing', async () => {
  delete process.env.ANTHROPIC_API_KEY
  await expect(promptClaude('classify')).rejects.toThrow(
    'Missing ANTHROPIC_API_KEY'
  )
  expect(Anthropic).not.toHaveBeenCalled()
})

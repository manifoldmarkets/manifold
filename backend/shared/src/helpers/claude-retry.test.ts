// claude.test.ts mocks the SDK. This file runs the real one against a fake
// fetch, so an SDK upgrade can't quietly change what promptClaude retries.
jest.mock('shared/utils', () => ({ log: { error: jest.fn() } }))

import { promptClaude } from './claude'

const originalKey = process.env.ANTHROPIC_API_KEY
let fetchSpy: jest.SpyInstance

const sse = (events: { type: string }[]) =>
  events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

const answer = (text: string) =>
  new Response(
    sse([
      {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 1 },
      },
      { type: 'message_stop' },
    ] as { type: string }[]),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  )

// What prod logged: undici rejects before any response arrives.
const dropConnection = () => Promise.reject(new TypeError('fetch failed'))

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'mock-key-not-a-credential'
  fetchSpy = jest.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = originalKey
})

it('retries a dropped connection once and returns the answer', async () => {
  fetchSpy
    .mockImplementationOnce(dropConnection)
    .mockImplementationOnce(async () => answer('yes'))
  await expect(promptClaude('classify')).resolves.toBe('yes')
  expect(fetchSpy).toHaveBeenCalledTimes(2)
})

it('gives up after the second dropped connection, leaving promptAI to fall back', async () => {
  fetchSpy.mockImplementation(dropConnection)
  await expect(promptClaude('classify')).rejects.toThrow('Connection error')
  expect(fetchSpy).toHaveBeenCalledTimes(2)
})

it('does not retry a request the API rejects outright', async () => {
  fetchSpy.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Your credit balance is too low',
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
  )
  await expect(promptClaude('classify')).rejects.toThrow('credit balance')
  expect(fetchSpy).toHaveBeenCalledTimes(1)
})

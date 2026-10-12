import Anthropic from '@anthropic-ai/sdk'
import { removeUndefinedProps } from 'common/util/object'
import { log } from 'shared/utils'
import { parseAIResponseAsJson } from './gemini'

// Claude Haiku 5.5 (https://platform.claude.com/docs/en/models/haiku-5-5/overview):
// $0.10 in / $0.50 out per 1M tokens for prompts up to 100k tokens ($0.50 /
// $2.50 above that), 1M context, adaptive thinking steered by `effort`.
// Built for exactly the work routed here: classification, extraction and
// short JSON answers. Released 2026-10-07; retirement not before 2027-10-07.
// Its tokenizer counts ~30% more tokens than Haiku 4.5 for the same text;
// the prices above still make it ~10x cheaper per call.
export const models = {
  haiku: 'claude-haiku-5-5' as const,
}

export type model_types = (typeof models)[keyof typeof models]

// Haiku 5.5 defaults to 'medium'. 'low' is right for yes/no and ID-list
// classification; 'high' for anything that has to weigh a thread of context.
export type ClaudeEffort = 'low' | 'medium' | 'high'

export type ClaudeOptions = {
  system?: string
  model?: model_types
  webSearch?: boolean
  effort?: ClaudeEffort
}

// Thinking tokens count toward max_tokens on Haiku 5.5. Our prompts want a
// few hundred output tokens at most; this leaves room to think at any effort
// level without truncating the answer.
const MAX_TOKENS = 8192

export const promptClaudeStream = async function* (
  prompt: string,
  options: ClaudeOptions = {}
): AsyncGenerator<string, void, unknown> {
  const { model = models.haiku, system, webSearch, effort } = options

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({ apiKey })

  // No temperature / top_p / top_k: every 5-series Claude model rejects a
  // non-default sampling parameter with a 400. (A hardcoded `temperature: 0`
  // here is why this helper could not be pointed at them before.) Adaptive
  // thinking is on by default; `effort` is the only lever.
  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: MAX_TOKENS,
      system,
      output_config: effort ? { effort } : undefined,
      tools: webSearch
        ? ([
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: 5,
            },
          ] as const)
        : undefined,
      messages: [
        {
          role: 'user' as const,
          content: prompt,
        },
      ],
    })
  )

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text
    } else if (chunk.type === 'message_delta') {
      // Haiku 5.5 runs safety classifiers and has no server-side fallback: a
      // declined request is a normal 200 with stop_reason 'refusal' and
      // (usually) no text. Surface it as an error so callers take their
      // existing failure path instead of parsing an empty string.
      if (chunk.delta.stop_reason === 'refusal') {
        throw new Error('Claude declined the request (stop_reason: refusal)')
      }
      if (chunk.delta.stop_reason === 'max_tokens') {
        log.warn('Claude response hit max_tokens', { model, effort })
      }
    }
  }
}

export const promptClaude = async (
  prompt: string,
  options: ClaudeOptions = {}
) => {
  let fullResponse = ''
  for await (const chunk of promptClaudeStream(prompt, options)) {
    fullResponse += chunk
  }
  return fullResponse
}

export const promptClaudeParsingJson = async <T>(
  prompt: string,
  options: ClaudeOptions = {}
): Promise<T> => {
  const response = await promptClaude(prompt, options)
  return parseAIResponseAsJson(response)
}

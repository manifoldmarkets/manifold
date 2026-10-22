import { APIError } from 'common/api/utils'
import { removeUndefinedProps } from 'common/util/object'
// import { buildArray } from 'common/util/array'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import OpenAI from 'openai'
import { log } from 'shared/utils'
import { parseAIResponseAsJson } from './gemini'
dayjs.extend(utc)
// Prices per 1M tokens as of Oct 2026 (https://developers.openai.com/api/docs/pricing):
//   gpt     gpt-6-sol   $2.00 in / $10.00 out  (replaces gpt-5.4 at $2.50 / $15)
//   gptMini gpt-6-luna  $0.10 in / $0.50 out   (replaces gpt-5.4-mini at $0.75 / $4.50)
export const models = {
  gpt: 'gpt-6-sol',
  gptMini: 'gpt-6-luna',
} as const
export const EMBEDDING_MODEL = 'text-embedding-3-small'

export const generateEmbeddings = async (
  question: string,
  opts?: { timeoutMs?: number; maxRetries?: number }
) => {
  let response
  try {
    // Inside the try: the constructor itself throws when no key is configured.
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    response = await openai.embeddings.create(
      {
        model: EMBEDDING_MODEL,
        input: question,
      },
      // Absent keys fall through to the SDK defaults (~10 min, 2 retries);
      // the SDK rejects explicitly-undefined values, hence the strip.
      removeUndefinedProps({
        timeout: opts?.timeoutMs,
        maxRetries: opts?.maxRetries,
      })
    )
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    log.error(
      'Error generating embeddings ' +
        (!process.env.OPENAI_API_KEY ? ' (no OpenAI API key found) ' : ' ') +
        message
    )
    return undefined
  }
  log('Made embeddings')
  return response.data[0]?.embedding
}

const defaultOptions: {
  system?: string
  model: (typeof models)[keyof typeof models]
  reasoning?: { effort: 'low' | 'medium' | 'high' }
  webSearch?: boolean
} = {
  model: models.gpt,
}

export const promptOpenAI = async (
  prompt: string,
  options: typeof defaultOptions = defaultOptions
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const { system, model, reasoning, webSearch } = options

  const result = await openai.responses
    .create({
      model,
      input: prompt,
      ...(system ? { instructions: system } : {}),
      ...(webSearch
        ? {
            tools: [
              {
                type: 'web_search_preview',
                search_context_size: 'high',
              },
            ],
            tool_choice: 'auto',
          }
        : {}),
      ...(reasoning ? { reasoning: { effort: reasoning.effort } } : {}),
      text: {
        // @ts-expect-error - sdk thinks it's not an option
        verbosity: 'low',
      },
    })
    .catch((err) => (console.log(err), undefined))

  if (!result) throw new APIError(500, 'No result from OpenAI')

  const message = (result as any).output_text as string | undefined
  log('OpenAI Responses returned message:', message)
  if (!message) throw new APIError(500, 'No result from OpenAI')
  return message
}

export const promptOpenAIParsingAsJson = async (
  prompt: string,
  options: typeof defaultOptions = defaultOptions
) => {
  const res = await promptOpenAI(prompt, options)
  return parseAIResponseAsJson(res)
}

export const removeJsonTicksFromResponse = (response: string): string => {
  // Remove markdown code block formatting if present
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/
  const match = response.match(jsonBlockRegex)

  if (match && match[1]) {
    return match[1].trim()
  }

  // If no markdown formatting found, return the original response
  return response.trim()
}

export const promptOpenAIWebSearchParseJson = async <T>(
  prompt: string,
  options: typeof defaultOptions = defaultOptions
): Promise<T> => {
  const response = await promptOpenAI(prompt, { ...options, webSearch: true })
  return parseAIResponseAsJson(response)
}

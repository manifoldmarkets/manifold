import { APIError } from 'common/api/utils'
// import { buildArray } from 'common/util/array'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import OpenAI from 'openai'
import { log } from 'shared/utils'
import { parseAIResponseAsJson } from './gemini'
dayjs.extend(utc)
export const models = {
  gpt5: 'gpt-5',
  gpt5mini: 'gpt-5-mini',
} as const

export const generateEmbeddings = async (question: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let response
  try {
    response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    })
  } catch (e: any) {
    log.error(
      'Error generating embeddings ' +
        (!process.env.OPENAI_API_KEY ? ' (no OpenAI API key found) ' : ' ') +
        e.message
    )
    return undefined
  }
  log('Made embeddings for question', question)
  return response.data[0].embedding
}

const imagePrompt = (q: string) =>
  `Header image for a discussion thread about predicting "${q}". Do not include text.`

export const generateImage = async (q: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const prompt = imagePrompt(q)

  return await openai.images
    .generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
    })
    .then((res) => res.data[0].url)
    .catch((err) => (console.log(err), undefined))
}

const defaultOptions: {
  system?: string
  model: (typeof models)[keyof typeof models]
  reasoning?: { effort: 'low' | 'medium' | 'high' }
  webSearch?: boolean
} = {
  model: models.gpt5,
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

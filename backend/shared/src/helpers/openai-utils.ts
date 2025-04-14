import OpenAI from 'openai'
import * as dayjs from 'dayjs'
import { log } from 'shared/utils'
import * as utc from 'dayjs/plugin/utc'
import { APIError } from 'common/api/utils'
import { buildArray } from 'common/util/array'
dayjs.extend(utc)
export type MODELS = 'o3-mini' | 'gpt-4o' | 'gpt-4.1-2025-04-14'

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

export const promptOpenAI = async (
  prompt: string,
  model: MODELS,
  options: { system?: string } = {}
) => {
  const { system } = options
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const result = await openai.chat.completions
    .create({
      model,
      messages: buildArray(
        system && {
          role: 'system',
          content: system,
        },
        { role: 'user', content: prompt }
      ),
    })
    .catch((err) => (console.log(err), undefined))

  if (!result) throw new APIError(500, 'No result from OpenAI')

  const message = result.choices[0].message.content
  log('GPT4 returned message:', message)
  if (!message) throw new APIError(500, 'No result from OpenAI')
  return message
}

export const promptOpenAIWithTools = async (
  prompt: string,
  options: { model?: MODELS }
) => {
  const { model = 'gpt-4.1-2025-04-14' } = options
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const result = await openai.responses.create({
      model,
      input: prompt,
      tools: [{ type: 'web_search_preview', search_context_size: 'high' }], // Provide the tool definition
      tool_choice: 'required',
    })

    const message = result.output_text
    log('OpenAI with tools returned message:', message)
    if (!message) throw new Error('No message returned from OpenAI') // Changed to Error

    // Return the entire message object (could contain content or tool_calls)
    return message
  } catch (err: any) {
    log.error('Error calling OpenAI with tools:', err?.message ?? err)
    // Propagate the error or return a specific error indicator
    // Throwing an APIError might be suitable depending on usage context
    throw new APIError(
      500,
      `OpenAI API error: ${err?.message ?? 'Unknown error'}`
    )
  }
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

// Helper function to ensure the response is valid JSON, adapted from claude.ts
export const parseOpenAIResponseAsJson = (response: string): any => {
  const cleanedResponse = removeJsonTicksFromResponse(response)

  try {
    // Try to parse as is
    return JSON.parse(cleanedResponse)
  } catch (error) {
    // If parsing fails, try to handle common issues

    // Check if it's an array wrapped in extra text
    const arrayStart = cleanedResponse.indexOf('[')
    const arrayEnd = cleanedResponse.lastIndexOf(']')

    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      const potentialArray = cleanedResponse.substring(arrayStart, arrayEnd + 1)
      try {
        return JSON.parse(potentialArray)
      } catch (e) {
        // If still fails, throw the original error
        throw error
      }
    }

    // If we can't fix it, throw the original error
    throw error
  }
}

export const promptOpenAIParseJson = async <T>(
  prompt: string,
  options: { model?: MODELS } = {}
): Promise<T> => {
  const response = await promptOpenAIWithTools(prompt, options)
  return parseOpenAIResponseAsJson(response)
}

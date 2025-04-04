import OpenAI from 'openai'
import * as dayjs from 'dayjs'
import { log } from 'shared/utils'
import * as utc from 'dayjs/plugin/utc'
import { APIError } from 'common/api/utils'
import { buildArray } from 'common/util/array'
dayjs.extend(utc)
export type MODELS = 'o3-mini'

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

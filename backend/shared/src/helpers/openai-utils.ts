import OpenAI from 'openai'
import * as dayjs from 'dayjs'
import 'dayjs/plugin/utc'

export const generateEmbeddings = async (question: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let response
  try {
    response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: question,
    })
  } catch (e: any) {
    console.error(
      'Error generating embeddings',
      !process.env.OPENAI_API_KEY ? ' (no OpenAI API key found)' : '',
      e.message
    )
    return undefined
  }

  return response.data[0].embedding
}

export const getCloseDate = async (question: string, utcOffset?: number) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const now = dayjs.utc().format('M/D/YYYY h:mm a')

  let response
  try {
    response = await openai.completions.create({
      model: 'gpt-3.5-turbo-instruct',
      prompt: `Question: Will I finish the task by 2027?\nNow: 5/2/2026 12:11 pm\nEnd date: 12/31/2026 11:59 pm\n\nQuestion: Will an AI-drawn movie have a rating >=7.0 on IMDB before 2025?\nNow: 5/2/2019 3:47 pm\nEnd date: 12/31/2024 11:59 pm\n\nQuestion: Will Bolsanaro concede the election by Nov 15?\nNow: 8/5/2022 1:20 pm\nEnd date: 11/14/2022 11:59 pm\n\nQuestion: Will Dwarf Fortress be released on Steam this year?\nNow: 2/5/2023 11:24 am\nEnd date: 12/31/2023 11:59 pm\n\nQuestion: Will eat ice cream today?\nNow: 10/2/2022 5:55 pm\nEnd date: 10/2/2022 11:59 pm\n\nQuestion: ${question}\nNow: ${now}\nEnd date:`,
      temperature: 0.4,
      max_tokens: 15,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    })
  } catch (e: any) {
    console.error(
      'Error generating close date',
      !process.env.OPENAI_API_KEY ? ' (no OpenAI API key found)' : '',
      e.message
    )
    return undefined
  }

  const text = response.choices[0].text?.trim()
  if (!text) return undefined
  console.log(
    'AI-selected close date for question',
    question,
    ':',
    text,
    'utc offset',
    utcOffset ?? 'none'
  )

  const utcTime = dayjs.utc(text, 'M/D/YYYY h:mm a')
  const timestamp = utcTime.valueOf()
  if (!timestamp || !isFinite(timestamp)) return undefined

  // adjust for local timezone
  return utcTime.utcOffset(utcOffset ?? 0).valueOf()
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

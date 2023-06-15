import * as dayjs from 'dayjs'
import 'dayjs/plugin/utc'
import { Configuration, OpenAIApi } from 'openai'

export const initOpenAIApi = () => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })

  return new OpenAIApi(configuration)
}

let openai: OpenAIApi | undefined

export const generateEmbeddings = async (question: string) => {
  if (!openai) openai = initOpenAIApi()

  let response
  try {
    response = await openai.createEmbedding({
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

  if (response.status !== 200) return undefined

  return response.data.data[0].embedding
}

export const getCloseDate = async (question: string, utcOffset?: number) => {
  if (!openai) openai = initOpenAIApi()

  const now = dayjs.utc().format('M/D/YYYY h:mm a')

  let response
  try {
    response = await openai.createCompletion({
      model: 'text-davinci-003',
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

  if (response.status !== 200) return undefined

  const text = response.data.choices[0].text?.trim()
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

export const getImagePrompt = async (question: string) => {
  if (!openai) openai = initOpenAIApi()

  let response
  try {
    response = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: `The following are some examples of prompts for titles to be fed into the Dalle-2 image generation model:\n\n
      Title: "Will the new BART Transbay tube be completed by 2040"\n
      Prompt: “A futuristic looking train seen from above the water crossing the SF bay area, with a sunny sky and a view of the Bay area in the background".\n
      Title: "By 2040, will it be possible to take an electric VTOL aircraft on a trip of at least 75 miles for less than $100"\n
      Prompt: “An electric personal aircraft flying over a glowing, cyberpunk city skyline, with bright stars in the night sky"\n
      Title: "Will planned electricity shutdowns occur in France this winter?"\n
      Prompt: "A snowy scene with a person walking in a parisian city and the eiffel tower in the background"\n
      Title: "Will the United States' inflation rate be above 3% in 2023, 2024, and 2025?"\n
      Prompt: "The US dollar bill with the edges frayed and slightly burnt"\n
      Title: "Will proof emerge that the world is ruled by lizard people?"\n
      Prompt: "A council of lizard people in suits and ties, seated around a conference table with the world in the background"\n
      Title: "Will I live to be 200 years old?"\n
      Prompt: "An old and wise-looking person sitting in a cozy, futuristic house with glowing lights hovering around the scene."\n
      Title: "28. Will Twitter's net income be higher in 2023 than in 2022?"\n
      Prompt: "A flock of colorful twitter logos above a city skyline with dollar signs in the background."\n
      Please take the following title and create an image generator prompt, being very specific and detailed, that conveys a related concept:\n
      Title: ${question}\n
      Prompt:`,
      temperature: 1,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    })
  } catch (e: any) {
    console.error(
      'Error generating image prompt',
      !process.env.OPENAI_API_KEY ? ' (no OpenAI API key found)' : '',
      e.message
    )
    return undefined
  }

  if (response.status !== 200) return undefined

  const text = response.data.choices[0].text
  if (!text) return undefined
  console.log('AI-selected image prompt for question', question, ':', text)

  return text
}

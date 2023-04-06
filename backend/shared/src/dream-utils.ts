import { DOMAIN } from 'common/envs/constants'
const MODIFIERS =
  '8k, beautiful, illustration, trending on art station, picture of the day, epic composition'
export const dreamWithDefaultParams = async (input: string) => {
  try {
    const API_KEY = process.env.DREAM_KEY

    const data = {
      prompt: input + ', ' + MODIFIERS,
      apiKey: API_KEY,
    }
    const response = await fetch(`https://${DOMAIN}/api/v0/dream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await response.json()
    return json.url as string
  } catch (e) {
    console.log('Error dreaming cover image: ', e)
    return undefined
  }
}

export const dalleWithDefaultParams = async (input: string) => {
  try {
    const API_KEY = process.env.OPENAI_API_KEY

    const data = {
      prompt: input + ', ' + MODIFIERS,
      apiKey: API_KEY,
    }
    const response = await fetch(`https://${DOMAIN}/api/v0/dalle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await response.json()
    return json.url as string
  } catch (e) {
    console.log('Error dalle-ing cover image: ', e)
    return undefined
  }
}

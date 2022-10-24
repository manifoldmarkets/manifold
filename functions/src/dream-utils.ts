import fetch from 'node-fetch'
import { DOMAIN } from '../../common/envs/constants'

export const dreamWithDefaultParams = async (input: string) => {
  const API_KEY = process.env.NEXT_PUBLIC_DREAM_KEY
  console.log('Tempo Logging of prod calls APIKEY: ', API_KEY)
  const MODIFIERS =
    '8k, beautiful, illustration, trending on art station, picture of the day, epic composition'
  const data = {
    prompt: input + ', ' + MODIFIERS,
    apiKey: API_KEY,
  }
  console.log('Logging prod calls DOMAIN: ', `https://${DOMAIN}/api/v0/dream`)
  const response = await fetch(`https://${DOMAIN}/api/v0/dream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  console.log('Logging prod calls RESPONSE: ', response)
  const json = await response.json()
  console.log('Logging prod calls JSON: ', json)
  console.log('Logging prod calls JSON URL: ', json.url)
  return json.url as string
}

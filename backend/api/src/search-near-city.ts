import { GiphyFetch } from '@giphy/js-fetch-api'
import { z } from 'zod'
import { jsonEndpoint, validate } from './helpers'

const bodySchema = z.object({
  your_city_id: z.string(),
  radius: z.number(),
})

export const searchnearcity = jsonEndpoint(async (req) => {
  const { your_city_id, radius } = validate(bodySchema, req.body)
  const apiKey = process.env.GEODB_API_KEY

  if (!apiKey) {
    return { status: 'failure', data: 'Missing GEODB API key' }
  }
  const host = 'wft-geo-db.p.rapidapi.com'
  const baseUrl = `https://${host}/v1/geo`
  const url = `${baseUrl}/cities/${your_city_id}/nearbyCities&radius=${radius}&offset=0&sort=-population`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': host,
      },
    })
    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`)
    }

    const data = await res.json()
    return { status: 'success', data: data }
  } catch (error) {
    return { status: 'failure', data: error }
  }
})

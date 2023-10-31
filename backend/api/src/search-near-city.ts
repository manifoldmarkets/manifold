import { GiphyFetch } from '@giphy/js-fetch-api'
import { z } from 'zod'
import { jsonEndpoint, validate } from './helpers'

const bodySchema = z.object({
  cityId: z.string(),
  radius: z.number().refine((data) => data > 0 && data < 501, {
    message: 'Number must be greater than 0 and less than 501',
  }),
})

export const searchnearcity = jsonEndpoint(async (req) => {
  const { cityId, radius } = validate(bodySchema, req.body)
  const apiKey = process.env.GEODB_API_KEY
  console.log('APIIIIIÏ', apiKey)

  if (!apiKey) {
    return { status: 'failure', data: 'Missing GEODB API key' }
  }
  const host = 'wft-geo-db.p.rapidapi.com'
  const baseUrl = `https://${host}/v1/geo`
  // const url = `${baseUrl}/cities/${cityId}/nearbyCities?radius=${radius}&offset=0&sort=-population`
  const url = `${baseUrl}/cities/${cityId}/nearbyCities?radius=${radius}&sort=-population`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': host,
      },
    })

    console.log(res.json())
    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`)
    }

    const data = await res.json()
    console.log('DATAAAAAAAAA\n', data)
    const ids = data.map((item) => (item as { id: number }).id)
    return { status: 'success', data: ids }
  } catch (error) {
    console.log('ERRRORRR', error)
    return { status: 'failure', data: error }
  }
})

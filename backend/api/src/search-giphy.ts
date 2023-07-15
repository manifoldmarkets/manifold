import { z } from 'zod'
import { Json, MaybeAuthedEndpoint, validate } from './helpers'
import { GiphyFetch } from '@giphy/js-fetch-api'

const bodySchema = z.object({
  term: z.string(),
  limit: z.number(),
})

export const searchgiphy = MaybeAuthedEndpoint(async (req, auth) => {
  const { term, limit } = validate(bodySchema, req.body)
  if (!process.env.REACT_APP_GIPHY_KEY) {
    return { status: 'failure', data: 'Missing GIPHY API key' }
  }
  const giphy = new GiphyFetch(process.env.REACT_APP_GIPHY_KEY)

  try {
    const res =
      term.length === 0
        ? await giphy.trending({ limit: limit })
        : await giphy.search(term, { limit: limit })
    return { status: 'success', data: res.data }
  } catch (error) {
    return { status: 'failure', data: error }
  }
})

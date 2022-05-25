import { NextApiRequest, NextApiResponse } from 'next'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { applyCorsHeaders } from 'web/lib/api/cors'
import { fetchBackend, forwardResponse } from 'web/lib/api/proxy'

export const config = { api: { bodyParser: false } }

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })
  try {
    const backendRes = await fetchBackend(req, 'placeBet')
    await forwardResponse(res, backendRes)
  } catch (err) {
    console.error('Error talking to cloud function: ', err)
    res.status(500).json({ message: 'Error communicating with backend.' })
  }
}

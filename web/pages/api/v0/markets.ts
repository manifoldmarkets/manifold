import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import { fetchBackend, forwardResponse } from 'web/lib/api/proxy'

export const config = { api: { bodyParser: false } }

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res)
  try {
    const backendRes = await fetchBackend(req, 'v0/markets')
    await forwardResponse(res, backendRes)
  } catch (err) {
    console.error('Error talking to backend: ', err)
    res.status(500).json({ message: 'Error communicating with backend.' })
  }
}

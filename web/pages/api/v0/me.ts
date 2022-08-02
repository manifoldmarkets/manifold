import { NextApiRequest, NextApiResponse } from 'next'
import { fetchBackend, forwardResponse } from 'web/lib/api/proxy'
import { LiteUser, ApiError } from './_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiteUser | ApiError>
) {
  try {
    const backendRes = await fetchBackend(req, 'getcurrentuser')
    await forwardResponse(res, backendRes)
  } catch (err) {
    console.error('Error talking to cloud function: ', err)
    res.status(500).json({ error: 'Error communicating with backend.' })
  }
}

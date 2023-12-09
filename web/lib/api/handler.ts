import { APIPath } from 'common/api/schema'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from './cors'
import { fetchBackend, forwardResponse } from './proxy'
import { pathWithPrefix } from 'common/api/utils'

export function nextHandler(path: APIPath) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    await applyCorsHeaders(req, res)
    try {
      const backendRes = await fetchBackend(req, pathWithPrefix(path))
      await forwardResponse(res, backendRes)
    } catch (err) {
      console.error('Error talking to cloud function: ', err)
      res.status(500).json({ message: 'Error communicating with backend.' })
    }
  }
}

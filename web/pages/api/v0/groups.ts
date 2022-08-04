import type { NextApiRequest, NextApiResponse } from 'next'
import { listAllGroups } from 'web/lib/firebase/groups'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'

type Data = any[]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const groups = await listAllGroups()
  res.setHeader('Cache-Control', 'max-age=0')
  res.status(200).json(groups)
}

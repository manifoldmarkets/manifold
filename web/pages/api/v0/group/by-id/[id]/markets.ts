import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { listGroupContracts } from 'web/lib/firebase/groups'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contracts = await listGroupContracts(id as string)
  if (!contracts) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  res.setHeader('Cache-Control', 'no-cache')
  return res.status(200).json(contracts)
}

import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { listGroupContracts } from 'web/lib/firebase/groups'
import { toLiteMarket } from 'web/pages/api/v0/_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contracts = (await listGroupContracts(id as string)).map((contract) =>
    toLiteMarket(contract)
  )
  if (!contracts) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  res.setHeader('Cache-Control', 'no-cache')
  return res.status(200).json(contracts)
}

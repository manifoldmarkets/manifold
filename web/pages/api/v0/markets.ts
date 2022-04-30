// Next.js API route support: https://vercel.com/docs/concepts/functions/serverless-functions
import type { NextApiRequest, NextApiResponse } from 'next'
import { listAllContracts } from '../../../lib/firebase/contracts'
import { toLiteMarket } from './_types'
import { applyCorsHeaders, CORS_UNRESTRICTED } from '../../../lib/api/cors'

type Data = any[]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const contracts = await listAllContracts()
  // Serve from Vercel cache, then update. see https://vercel.com/docs/concepts/functions/edge-caching
  res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate')
  res.status(200).json(contracts.map(toLiteMarket))
}

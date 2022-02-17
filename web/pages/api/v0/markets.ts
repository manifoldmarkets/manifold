// Next.js API route support: https://vercel.com/docs/concepts/functions/serverless-functions
import type { NextApiRequest, NextApiResponse } from 'next'
import { listAllContracts } from '../../../lib/firebase/contracts'
import { toLiteContract } from './_types'

type Data = any[]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const contracts = await listAllContracts()
  // Serve from Vercel cache, then update. see https://vercel.com/docs/concepts/functions/edge-caching
  res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate')
  res.status(200).json(contracts.map(toLiteContract))
}

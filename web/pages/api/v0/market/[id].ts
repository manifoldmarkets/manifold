import { NextApiRequest, NextApiResponse } from 'next'
import { listAllBets } from 'web/lib/firebase/bets'
import { listAllComments } from 'web/lib/firebase/comments'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { FullMarket, ApiError, toLiteMarket } from '../_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullMarket | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contractId = id as string

  const [contract, allBets, comments] = await Promise.all([
    getContractFromId(contractId),
    listAllBets(contractId),
    listAllComments(contractId),
  ])

  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }

  // Cache on Vercel edge servers for 2min
  res.setHeader('Cache-Control', 'max-age=0, s-maxage=120')
  return res.status(200).json({
    ...toLiteMarket(contract),
    allBets,
    comments,
  })
}

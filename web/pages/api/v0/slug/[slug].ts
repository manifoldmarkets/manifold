import { NextApiRequest, NextApiResponse } from 'next'
import { Bet, listAllBets } from '../../../../lib/firebase/bets'
import { listAllComments } from '../../../../lib/firebase/comments'
import { getContractFromSlug } from '../../../../lib/firebase/contracts'
import { FullMarket, ApiError, toLiteMarket } from '../_types'
import { applyCorsHeaders, CORS_UNRESTRICTED } from '../../../../lib/api/cors'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullMarket | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { slug } = req.query

  const contract = await getContractFromSlug(slug as string)

  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }

  const [allBets, comments] = await Promise.all([
    listAllBets(contract.id),
    listAllComments(contract.id),
  ])

  const bets = allBets.map(({ userId, ...bet }) => bet) as Exclude<
    Bet,
    'userId'
  >[]

  // Cache on Vercel edge servers for 2min
  res.setHeader('Cache-Control', 'max-age=0, s-maxage=120')
  return res.status(200).json({
    ...toLiteMarket(contract),
    bets,
    comments,
  })
}

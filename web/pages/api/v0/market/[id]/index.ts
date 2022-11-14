import { NextApiRequest, NextApiResponse } from 'next'
import { listAllBets } from 'web/lib/firebase/bets'
import { listAllComments } from 'web/lib/firebase/comments'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { FullMarket, ApiError, toFullMarket } from '../../_types'
import { marketCacheStrategy } from '../../markets'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullMarket | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contractId = id as string

  // mqp: testing hypothesis that this app is driving most of our costs
  // by spamming market API but not using bets and comments

  if (req.headers.referer === 'https://ogxt.github.io/') {
    const contract = await getContractFromId(contractId)
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' })
      return
    }

    res.setHeader('Cache-Control', marketCacheStrategy)
    return res.status(200).json(toFullMarket(contract))
  } else {
    const [contract, bets, comments] = await Promise.all([
      getContractFromId(contractId),
      listAllBets(contractId),
      listAllComments(contractId),
    ])

    if (!contract) {
      res.status(404).json({ error: 'Contract not found' })
      return
    }

    res.setHeader('Cache-Control', marketCacheStrategy)
    return res.status(200).json({ comments, bets, ...toFullMarket(contract) })
  }
}

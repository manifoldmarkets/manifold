import { NextApiRequest, NextApiResponse } from 'next'
import { listAllBets } from '../../../../lib/firebase/bets'
import { listAllComments } from '../../../../lib/firebase/comments'
import { getContractFromSlug } from '../../../../lib/firebase/contracts'
import { FullContract, ApiError, toLiteContract } from '../_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullContract | ApiError>
) {
  const { slug } = req.query

  const contract = await getContractFromSlug(slug as string)

  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }

  const [bets, comments] = await Promise.all([
    listAllBets(contract.id),
    listAllComments(contract.id),
  ])

  // Cache on Vercel edge servers for 2min
  res.setHeader('Cache-Control', 'max-age=0, s-maxage=120')
  return res.status(200).json({
    ...toLiteContract(contract),
    bets,
    comments,
  })
}

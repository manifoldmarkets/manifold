import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { Bet, getUserBets } from 'web/lib/firebase/bets'
import { getUserByUsername } from 'web/lib/firebase/users'
import { ApiError } from '../../../_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Bet[] | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { username } = req.query

  const user = await getUserByUsername(username as string)

  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const bets = await getUserBets(user.id, { includeRedemptions: false })

  res.setHeader('Cache-Control', 'max-age=0')
  return res.status(200).json(bets)
}

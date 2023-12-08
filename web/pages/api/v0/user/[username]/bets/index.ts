import { NextApiRequest, NextApiResponse } from 'next'
import { nextHandler } from 'web/lib/api/handler'
import { appendQuery } from 'web/lib/firebase/api'

const betsHandler = nextHandler('bets')

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { username } = req.query
  req.url = appendQuery(req.url ?? '/', { username })
  return betsHandler(req, res)
}

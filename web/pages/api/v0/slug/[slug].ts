import { NextApiRequest, NextApiResponse } from 'next'
import { nextHandler } from 'web/lib/api/handler'
import { appendQuery } from 'web/lib/firebase/api'

const marketHandler = nextHandler('market')

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { slug } = req.query
  req.url = appendQuery(req.url ?? '/', { slug })
  return marketHandler(req, res)
}

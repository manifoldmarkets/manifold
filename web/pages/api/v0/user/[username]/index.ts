import { NextApiRequest, NextApiResponse } from 'next'
import { nextHandler } from 'web/lib/api/handler'
import { appendQuery } from 'web/lib/firebase/api'

const userHandler = nextHandler('user')

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { username } = req.query

  req.url = appendQuery(req.url ?? '/', { username })
  return userHandler(req, res)
}

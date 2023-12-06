import { NextApiRequest, NextApiResponse } from 'next'
import { nextHandler } from 'web/lib/api/handler'

export const config = { api: { bodyParser: true } }

const handler = nextHandler('cancel-bet')

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  const { betId } = req.query as { betId: string }
  if (req.body) req.body.betId = betId

  await handler(req, res)
}

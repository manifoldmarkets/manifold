import { NextApiRequest, NextApiResponse } from 'next'
import { nextHandler } from 'web/lib/api/handler'

export const config = { api: { bodyParser: true } }

const handler = nextHandler('awardBounty')

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query
  const contractId = id as string

  if (req.body) req.body.contractId = contractId
  await handler(req, res)
}

import { NextApiRequest, NextApiResponse } from 'next'
import { nextHandler } from 'web/lib/api/handler'

export const config = { api: { bodyParser: true } }

const tagHandler = nextHandler('update-tag')

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query
  if (req.body) req.body.contractId = id
  await tagHandler(req, res)
}

import { removeUndefinedProps } from 'common/util/object'
import { NextApiRequest, NextApiResponse } from 'next'
import { nextHandler } from 'web/lib/api/handler'
import { appendQuery } from 'web/lib/firebase/api'

const positionHandler = nextHandler('positions')

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id, userId, top, bottom, order } = req.query
  req.url = appendQuery(
    req.url ?? '/',
    removeUndefinedProps({ id, userId, top, bottom, order })
  )
  return positionHandler(req, res)
}

import { NextApiRequest, NextApiResponse } from 'next'
import { getUser } from 'web/lib/firebase/users'
import { User } from 'common/user'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { ApiError } from '../../_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<User | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const user = await getUser(id as string)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.setHeader('Cache-Control', 'no-cache')
  return res.status(200).json(user)
}

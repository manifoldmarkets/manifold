import { NextApiRequest, NextApiResponse } from 'next'
import { getUserByUsername } from 'web/lib/firebase/users'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { LiteUser, ApiError, toLiteUser } from '../../_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiteUser | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { username } = req.query
  const user = await getUserByUsername(username as string)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.setHeader('Cache-Control', 'no-cache')
  return res.status(200).json(toLiteUser(user))
}

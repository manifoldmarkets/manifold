import { User } from 'common/user'
import { NextApiRequest, NextApiResponse } from 'next'
import { fetchBackend } from 'web/lib/api/proxy'
import { LiteUser, ApiError, toLiteUser } from './_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiteUser | ApiError>
) {
  try {
    const backendRes = await fetchBackend(req, 'getcurrentuser')

    const user = (await backendRes.json()) as User
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.status(200).json(toLiteUser(user))
    return
  } catch (err) {
    console.error('Error talking to cloud function: ', err)
    res.status(500).json({ error: 'Error communicating with backend.' })
  }
}

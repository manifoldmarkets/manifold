// Next.js API route support: https://vercel.com/docs/concepts/functions/serverless-functions
import type { NextApiRequest, NextApiResponse } from 'next'
import { listAllUsers } from 'web/lib/firebase/users'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { toLiteUser } from './_types'

type Data = any[]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const users = await listAllUsers()
  res.setHeader('Cache-Control', 'max-age=0')
  res.status(200).json(users.map(toLiteUser))
}

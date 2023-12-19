import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'

export const config = { runtime: 'edge' }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await applyCorsHeaders(req, res)

  const deploymentId = process.env.VERCEL_URL
  return res.status(200).json({ deploymentId })
}

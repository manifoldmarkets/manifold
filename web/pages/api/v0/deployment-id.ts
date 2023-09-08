import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)

  const vercelUrl = process.env.VERCEL_URL ?? process.env.NEXT_PUBLIC_VERCEL_ENV
  console.log(
    'vercel url',
    vercelUrl,
    process.env.VERCEL_URL,
    process.env.NEXT_PUBLIC_VERCEL_ENV
  )
  return res.status(200).json({ deploymentId: vercelUrl })
}

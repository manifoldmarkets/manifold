// Next.js API route support: https://vercel.com/docs/concepts/functions/serverless-functions
import type { NextApiRequest, NextApiResponse } from 'next'
import { listAllUsers } from 'web/lib/firebase/users'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { toLiteUser, ValidationError } from './_types'
import { z } from 'zod'
import { validate } from './_validate'

const queryParams = z
  .object({
    limit: z
      .number()
      .default(500)
      .or(z.string().regex(/\d+/).transform(Number))
      .refine((n) => n >= 0 && n <= 1000, 'Limit must be between 0 and 1000'),
    before: z.string().optional(),
  })
  .strict()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)

  let params: z.infer<typeof queryParams>
  try {
    params = validate(queryParams, req.query)
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json(e)
    }
    console.error(`Unknown error during validation: ${e}`)
    return res.status(500).json({ error: 'Unknown error during validation' })
  }

  const { limit, before } = params

  try {
    const users = await listAllUsers(limit, before)
    res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=45')
    res.status(200).json(users.map(toLiteUser))
  } catch (e) {
    res.status(400).json({
      error:
        'Failed to fetch users (did you pass an invalid ID as the before parameter?)',
    })
    return
  }
}

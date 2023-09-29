import { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, ValidationError } from 'web/pages/api/v0/_types'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { z } from 'zod'
import { validate } from 'web/pages/api/v0/_validate'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'
import { ManaPayTxn } from 'common/txn'
const queryParams = z
  .object({
    userId: z.string().optional(),
    limit: z
      .number()
      .default(1000)
      .or(z.string().regex(/\d+/).transform(Number))
      .refine((n) => n >= 0 && n <= 1000, 'Limit must be between 0 and 1000'),
    before: z.string().optional(),
  })
  .strict()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ManaPayTxn[] | ValidationError | ApiError>
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
  try {
    const { userId, before, limit } = params
    let query = db
      .from('txns')
      .select('data')
      .order('data->createdTime', { ascending: false } as any)
      .limit(limit)
    if (before) query = query.lt('data->createdTime', before)
    if (userId)
      query = query.contains('data', {
        category: 'MANA_PAYMENT',
        toId: userId,
      })
    else query = query.contains('data', { category: 'MANA_PAYMENT' })
    const { data } = await run(query)
    const grams = data.map((txn) => txn.data as ManaPayTxn) ?? []
    res.setHeader('Cache-Control', 'max-age=1, public')
    return res.status(200).json(grams)
  } catch (e) {
    console.error(`Error while fetching managrams: ${e}`)
    return res
      .status(500)
      .json({ error: 'Error while fetching managrams: ' + e })
  }
}

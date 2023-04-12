import type { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { z } from 'zod'
import { validate } from 'web/pages/api/v0/_validate'
import { ValidationError } from 'web/pages/api/v0/_types'
import { getMemberGroups, getPublicGroups } from 'web/lib/supabase/groups'
import { uniqBy } from 'lodash'
import { db } from 'web/lib/supabase/db'

const queryParams = z
  .object({
    availableToUserId: z.string().optional(),
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

  const { availableToUserId } = params

  if (availableToUserId) {
    // TODO: This doesn't work for private groups bc we haven't implemented api auth yet
    const memberGroups = await getMemberGroups(availableToUserId, db)
    const publicGroups = await getPublicGroups()
    const groups = uniqBy(memberGroups.concat(publicGroups), 'id')
    res.setHeader('Cache-Control', 'max-age=60')
    res.status(200).json(groups)
    return
  }

  const groups = await getPublicGroups()
  res.setHeader('Cache-Control', 'max-age=60')
  res.status(200).json(groups)
}

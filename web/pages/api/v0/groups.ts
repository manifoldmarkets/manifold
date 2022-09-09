import type { NextApiRequest, NextApiResponse } from 'next'
import { listAllGroups, listAvailableGroups } from 'web/lib/firebase/groups'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { z } from 'zod'
import { validate } from 'web/pages/api/v0/_validate'
import { ValidationError } from 'web/pages/api/v0/_types'

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

  // TODO: should we check if the user is a real user?
  if (availableToUserId) {
    const groups = await listAvailableGroups(availableToUserId)
    res.setHeader('Cache-Control', 'max-age=0')
    res.status(200).json(groups)
    return
  }

  const groups = await listAllGroups()
  res.setHeader('Cache-Control', 'max-age=0')
  res.status(200).json(groups)
}

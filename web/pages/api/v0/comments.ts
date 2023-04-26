import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { Comment, listAllComments } from 'web/lib/firebase/comments'
import { getContractFromSlug } from 'web/lib/supabase/contracts'
import { ApiError, ValidationError } from './_types'
import { z } from 'zod'
import { validate } from './_validate'
import { db } from 'web/lib/supabase/db'

const queryParams = z
  .object({
    contractId: z.string().optional(),
    contractSlug: z.string().optional(),
    limit: z
      .number()
      .default(1000)
      .or(z.string().regex(/\d+/).transform(Number))
      .refine((n) => n >= 0 && n <= 1000, 'Limit must be between 0 and 1000'),
    before: z.string().optional(),
  })
  .strict()

const getContractId = async (params: z.infer<typeof queryParams>) => {
  if (params.contractId) {
    return params.contractId
  }
  if (params.contractSlug) {
    const contract = await getContractFromSlug(params.contractSlug, db)
    if (contract) {
      return contract.id
    } else {
      throw new Error('Contract not found.')
    }
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Comment[] | ValidationError | ApiError>
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
    const contractId = await getContractId(params)
    if (!contractId) {
      return res.status(400).json({ error: 'You must specify a contract.' })
    }
    const comments = await listAllComments(contractId)

    res.setHeader('Cache-Control', 'max-age=15, public')
    return res.status(200).json(comments)
  } catch (e) {
    console.error(`Error while fetching comments: ${e}`)
    return res
      .status(500)
      .json({ error: 'Error while fetching comments: ' + e })
  }
}

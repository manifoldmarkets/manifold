import { FullQuestion, toFullQuestion } from 'common/api-question-types'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { getContractFromSlug } from 'web/lib/supabase/contracts'
import { ApiError } from '../_types'
import { db } from 'web/lib/supabase/db'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullQuestion | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { slug } = req.query

  const contract = await getContractFromSlug(slug as string, db)

  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }

  res.setHeader('Cache-Control', 'max-age=0')
  return res.status(200).json(toFullQuestion(contract))
}

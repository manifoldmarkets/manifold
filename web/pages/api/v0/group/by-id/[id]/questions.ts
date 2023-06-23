import { toLiteQuestion } from 'common/api-question-types'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { questionCacheStrategy } from 'web/pages/api/v0/question/[id]'
import { getGroupQuestions } from 'web/lib/supabase/group'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contracts = (await getGroupQuestions(id as string))?.map((contract) =>
    toLiteQuestion(contract)
  )
  if (!contracts) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  res.setHeader('Cache-Control', questionCacheStrategy)
  return res.status(200).json(contracts)
}

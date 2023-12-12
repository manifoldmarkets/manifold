import { NextApiRequest, NextApiResponse } from 'next'
import { nextHandler } from 'web/lib/api/handler'
import { appendQuery } from 'web/lib/firebase/api'

const searchHandler = nextHandler('search-markets')

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { term, terms, ...rest } = req.query
  // "terms" is a deprecated query param for the search term
  const realTerm = term ?? terms
  const props = { term: realTerm, ...rest }
  req.url = appendQuery(req.url ?? '/', props)

  await searchHandler(req, res)
}

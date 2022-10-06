import { NextApiRequest, NextApiResponse } from 'next'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { applyCorsHeaders } from 'web/lib/api/cors'
import { fetchBackend, forwardResponse } from 'web/lib/api/proxy'
import { htmlToRichText } from 'common/util/parse'
import { micromark } from 'micromark'

export const config = { api: { bodyParser: true } }

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  const { id } = req.query
  const contractId = id as string

  if (req.body) {
    req.body.contractId = contractId

    if (req.body.html && !req.body.content) {
      req.body.content = htmlToRichText(req.body.html)
    } else if (req.body.markdown && !req.body.content) {
      req.body.content = htmlToRichText(micromark(req.body.markdown))
    }
  }

  try {
    const backendRes = await fetchBackend(req, 'createcomment')
    await forwardResponse(res, backendRes)
  } catch (err) {
    console.error('Error talking to cloud function: ', err)
    res.status(500).json({ message: 'Error communicating with backend.' })
  }
}

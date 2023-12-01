import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import { ApiError } from 'web/pages/api/v0/_types'
import { LinkPreview, fetchLinkPreview } from 'common/link-preview'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LinkPreview | ApiError>
) {
  await applyCorsHeaders(req, res, {
    methods: 'GET',
  })

  console.log(req.query)

  const { url } = req.query
  if (!(typeof url === 'string'))
    return res.status(400).json({ error: 'requires param url (string)' })

  const preview = await fetchLinkPreview(url)
  if (preview) {
    // Cache for 1 day
    res.setHeader(
      'Cache-Control',
      's-maxage=86400, stale-while-revalidate=86400'
    )
    return res.status(200).json(preview)
  } else {
    return res.status(500).json({ error: 'Error fetching link preview' })
  }
}

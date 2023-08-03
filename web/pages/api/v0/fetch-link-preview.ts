import { NextApiRequest, NextApiResponse } from 'next'
import { CORS_UNRESTRICTED, applyCorsHeaders } from 'web/lib/api/cors'
import { ApiError } from 'web/pages/api/v0/_types'
import { getLinkPreview } from 'link-preview-js'

import { first } from 'lodash'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Awaited<ReturnType<typeof getLinkPreview>> | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { url } = req.body
  if (!url) return res.status(404).json({ error: 'url required' })
  try {
    const metadata = await fetchLinkPreview(url)
    res.setHeader('Cache-Control', 's-maxage=86400')
    return res.status(200).json(metadata)
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching link preview' })
  }
}

export async function fetchLinkPreview(url: string) {
  const preview = await getLinkPreview(url)
  const hasImage = 'images' in preview
  return { ...preview, image: hasImage ? first(preview.images) : null }
}

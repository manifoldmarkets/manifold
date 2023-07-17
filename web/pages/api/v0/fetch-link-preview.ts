import metascraper from 'metascraper'
import metascraperDescription from 'metascraper-description'
import metascraperImage from 'metascraper-image'
import metascraperTitle from 'metascraper-title'
import metascraperUrl from 'metascraper-url'
import { Metadata, NextApiRequest, NextApiResponse } from 'next'
import { CORS_UNRESTRICTED, applyCorsHeaders } from 'web/lib/api/cors'
import { ApiError } from 'web/pages/api/v0/_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Metadata | ApiError>
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
  const scraper = metascraper([
    metascraperDescription(),
    metascraperImage(),
    metascraperTitle(),
    metascraperUrl(),
  ])

  const response = await fetch(url)
  const html = await response.text()
  const responseUrl = response.url
  const metadata = await scraper({ html, url: responseUrl })
  return metadata
}

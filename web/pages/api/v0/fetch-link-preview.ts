// pages/api/fetch-link-preview.ts
import { NextApiRequest, NextApiResponse } from 'next'
import metascraper from 'metascraper'
import metascraperAuthor from 'metascraper-author'
import metascraperDate from 'metascraper-date'
import metascraperDescription from 'metascraper-description'
import metascraperImage from 'metascraper-image'
import metascraperLogo from 'metascraper-logo'
import metascraperPublisher from 'metascraper-publisher'
import metascraperTitle from 'metascraper-title'
import metascraperUrl from 'metascraper-url'
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  const { url } = req.body

  if (!url) {
    res.status(400).json({ message: 'URL is required' })
    return
  }

  try {
    const metadata = await fetchLinkPreview(url)
    res.status(200).json(metadata)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching link preview' })
  }
}

export default handler

export async function fetchLinkPreview(url: string) {
  const scraper = metascraper([
    metascraperAuthor(),
    metascraperDate(),
    metascraperDescription(),
    metascraperImage(),
    metascraperLogo(),
    metascraperPublisher(),
    metascraperTitle(),
    metascraperUrl(),
  ])

  console.log('fetching url', url)
  const response = await fetch(url)
  const html = await response.text()
  const responseUrl = response.url
  // convert html to string
  const metadata = await scraper({ html, url: responseUrl })
  console.log('metadata', metadata)
  return metadata
}

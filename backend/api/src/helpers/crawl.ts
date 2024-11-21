import FirecrawlApp from '@mendable/firecrawl-js'
import { APIError } from 'common/api/utils'

export const scrapeUrl = async (url: string) => {
  const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
  const scrapeResponse = await app.scrapeUrl(url, {
    formats: ['markdown'],
  })

  if (!scrapeResponse.success) {
    throw new APIError(500, `Failed to scrape: ${scrapeResponse.error}`)
  }

  return scrapeResponse
}

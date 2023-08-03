import { jsonEndpoint, validate } from 'api/helpers'
import { z } from 'zod'

const bodySchema = z.object({
  url: z.string(),
})
export const fetchlinkpreview = jsonEndpoint(async (req) => {
  const { url } = validate(bodySchema, req.body)
  try {
    const metadata = await fetchLinkPreviewInternal(url)
    console.log('meta', metadata)
    return { status: 'success', data: metadata }
  } catch (error) {
    return { status: 'failure', data: error }
  }
})

async function fetchLinkPreviewInternal(url: string) {
  const metascraper = require('metascraper')([
    require('metascraper-description')(),
    require('metascraper-image')(),
    require('metascraper-title')(),
    require('metascraper-url')(),
  ])

  const response = await fetch(url)
  const html = await response.text()
  const responseUrl = response.url
  return await metascraper({ html, url: responseUrl })
}

import { jsonEndpoint, validate } from 'api/helpers'
import { z } from 'zod'
import { getLinkPreview } from 'link-preview-js'
import { first } from 'lodash'

const bodySchema = z.object({
  url: z.string(),
})
export const fetchlinkpreview = jsonEndpoint(async (req) => {
  const { url } = validate(bodySchema, req.body)
  try {
    const metadata = await fetchLinkPreviewInternal(url)
    return {
      status: 'success',
      data: metadata,
    }
  } catch (error) {
    return { status: 'failure', data: error }
  }
})

async function fetchLinkPreviewInternal(url: string) {
  const preview = await getLinkPreview(url)
  const hasImage = 'images' in preview
  return { ...preview, image: hasImage ? first(preview.images) : null }
}

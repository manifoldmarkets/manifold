import { keyBy } from 'lodash'
import { fetchLinkPreview, LinkPreview } from 'common/link-preview'
import { cache } from 'react'

export const fetchLinkPreviews = cache(async (urls: string[]) => {
  const previews = (await Promise.all(urls.map(fetchLinkPreview))).filter(
    (preview): preview is LinkPreview => preview !== undefined
  )

  return keyBy(previews, 'url')
})

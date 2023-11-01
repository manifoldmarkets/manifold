import { getLinkPreview } from 'link-preview-js'
import { keyBy } from 'lodash'
import { removeUndefinedProps } from './util/object'

export type LinkPreview = {
  image?: string
  url: string
  title: string
  description?: string
  siteName?: string
}

export type LinkPreviews = { [url: string]: LinkPreview }

export async function fetchLinkPreview(url: string) {
  try {
    const preview = await getLinkPreview(url)
    if (!('title' in preview)) {
      return undefined
    }
    const { title, description, siteName, images } = preview

    return removeUndefinedProps({
      url,
      title,
      description,
      siteName,
      image: images.length ? images[0] : undefined,
    }) as LinkPreview
  } catch (error) {
    console.error(error)
    return undefined
  }
}

export async function fetchLinkPreviews(urls: string[]) {
  const previews = (await Promise.all(urls.map(fetchLinkPreview))).filter(
    (preview): preview is LinkPreview => preview !== undefined
  )

  return keyBy(previews, 'url')
}

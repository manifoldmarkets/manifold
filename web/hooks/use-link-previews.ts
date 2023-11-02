import { LinkPreview } from 'common/link-preview'
import { useEffect, useState } from 'react'
import { clientFetchLinkPreview } from 'web/lib/firebase/api'
import { safeLocalStorage } from 'web/lib/util/local'

export const useLinkPreview = (url: string) => {
  const [preview, setPreview] = useState<LinkPreview | undefined>(undefined)
  useEffect(() => {
    if (url) {
      cachedLinkPreview(url).then((p) => setPreview(p))
    } else {
      setPreview(undefined)
    }
  }, [url])
  return preview
}

export const cachedLinkPreview = async (url: string) => {
  const cacheKey = `link-preview-${url}`
  const cached = safeLocalStorage?.getItem(cacheKey)
  if (cached) return JSON.parse(cached) as LinkPreview
  const preview = await clientFetchLinkPreview(url)
  if (preview) {
    safeLocalStorage?.setItem(cacheKey, JSON.stringify(preview))
  }
  return preview
}

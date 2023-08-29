import { News } from 'common/news'
import { useEffect, useState } from 'react'
import { safeLocalStorage } from 'web/lib/util/local'

export const useLinkPreviews = (urls: string[]) => {
  const [previews, setPreviews] = useState<News[]>([])

  useEffect(() => {
    Promise.all(urls.map((url) => cachedLinkPreview(url))).then((l) =>
      setPreviews(l.filter((p) => !!p))
    )
  }, [urls.join(',')])

  return previews
}

export const useLinkPreview = (url: string) => {
  const [preview, setPreview] = useState<News | undefined>(undefined)
  useEffect(() => {
    cachedLinkPreview(url).then((p) => setPreview(p))
  }, [url])
  return preview
}

export const getLinkPreview = async (url: string) => {
  return fetch('/api/v0/fetch-link-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
    }),
  }).then(async (res) => {
    const data = await res.json()
    if (!data) return undefined
    const { title } = data
    const processedTitle = title?.split(' | ')[0]
    return { ...data, title: processedTitle, url }
  })
}

export const cachedLinkPreview = async (url: string) => {
  const cacheKey = `link-preview-${url}`
  const cached = safeLocalStorage?.getItem(cacheKey)
  if (cached) return JSON.parse(cached) as News
  const preview = await getLinkPreview(url)
  safeLocalStorage?.setItem(cacheKey, JSON.stringify(preview))
  return preview
}

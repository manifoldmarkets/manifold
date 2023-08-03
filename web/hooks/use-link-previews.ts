import { News } from 'common/news'
import { useEffect, useState } from 'react'

export const useLinkPreviews = (urls: string[]) => {
  const [previews, setPreviews] = useState<News[]>([])

  useEffect(() => {
    Promise.all(urls.map((url) => getLinkPreview(url))).then((l) =>
      setPreviews(l.filter((p) => !!p))
    )
  }, [urls.join(',')])

  return previews
}

export const useLinkPreview = (url: string) => {
  const [preview, setPreview] = useState<News | undefined>(undefined)
  useEffect(() => {
    getLinkPreview(url).then((p) => setPreview(p))
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

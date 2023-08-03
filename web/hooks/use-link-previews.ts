import { News } from 'common/news'
import { useEffect, useState } from 'react'
import { fetchLinkPreview } from 'web/lib/firebase/api'

export const useLinkPreviews = (urls: string[]) => {
  const [previews, setPreviews] = useState<News[]>([])

  useEffect(() => {
    Promise.all(urls.map((url) => getLinkPreview(url))).then((l) =>
      setPreviews(l.filter((p) => !!p) as News[])
    )
  }, [urls.join(',')])

  return previews
}

export const getLinkPreview = async (url: string) => {
  return fetchLinkPreview({ url }).then(({ data }) => {
    if (!data) return undefined
    const { title } = data
    const processedTitle = title?.split(' | ')[0]
    return { ...data, title: processedTitle, url }
  })
}

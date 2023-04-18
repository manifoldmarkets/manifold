import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

export const useSearchQueryParameter = (
  endpoint: string,
  queryParameter: string
) => {
  const router = useRouter()
  const param = router.query[queryParameter]
  const [query, setQuery] = useState(router.isReady && param ? param : '')

  useEffect(() => {
    if (!router.isReady) return
    const queryParam = router.query[queryParameter]
    if (queryParam && queryParam !== query) {
      setQuery(queryParam.toString())
    }
  }, [router.query, router.isReady, queryParameter])

  useEffect(() => {
    if (!router.isReady) return
    if (query)
      router.push(`${endpoint}?${queryParameter}=${query}`, undefined, {
        shallow: true,
      })
    else router.push(`/users`, undefined, { shallow: true })
  }, [query, router.isReady, queryParameter, endpoint])

  return { query, setQuery }
}

import { useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { URLSearchParams } from 'url'
export const useDefinedSearchParams = () => {
  // Note: useSearchParams() must be used inside a <Suspense> component if page is SSR
  const searchParams = useSearchParams()!
  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams as URLSearchParams)
      params.set(name, value)

      return params.toString()
    },
    [searchParams]
  )
  return {
    searchParams,
    createQueryString,
  }
}

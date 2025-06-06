import { useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
export const useDefinedSearchParams = () => {
  // Note: useSearchParams() must be used inside a <Suspense> component if page is SSR
  const searchParams = useSearchParams()!
  const createQueryString = useCallback(
    (name: string, value: string) => {
      // Note: don't cast searchParams as URLSearchParams or you'll break this instantiation
      const params = new URLSearchParams(searchParams as any)
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

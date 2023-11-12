import { removeUndefinedProps } from 'common/util/object'
import { useRouter } from 'next/router'
import { useCallback } from 'react'

export function useSearchParam<T extends string | Array<string>>(key: string) {
  const { query, push } = useRouter()
  const value = query[key] as T | undefined

  const setValue = useCallback(
    (value: T | undefined) => {
      push(
        { query: removeUndefinedProps({ ...query, [key]: value }) },
        undefined,
        {
          shallow: true,
        }
      )
    },
    [key, query] as const
  )

  return [value, setValue] as const
}

import { useEffect } from 'react'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function useShopItemCounts() {
  const { data, loading, refresh } = useAPIGetter(
    'get-shop-item-counts',
    {},
    undefined,
    'shop-item-counts'
  )

  useEffect(() => {
    const id = setInterval(() => refresh(), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return { counts: (data as any)?.counts ?? {}, loading }
}

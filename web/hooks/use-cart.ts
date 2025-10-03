import { useMemo } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export type CartItem = {
  key: string // stable key for dedupe e.g. digital:id or printful:productId:variantId
  title: string
  imageUrl?: string
  price: number
  quantity: number
  meta?: Record<string, any>
}

const STORAGE_KEY = 'shop_cart_v1'

export function useCart() {
  const [items, setItems, ready] = usePersistentLocalState<CartItem[]>(
    [],
    STORAGE_KEY
  )

  const total = useMemo(
    () => items.reduce((sum, it) => sum + it.price * it.quantity, 0),
    [items]
  )

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.key === item.key)
      if (idx >= 0) {
        return prev.concat({ ...item, quantity: 1 })
      }
      return prev.concat(item)
    })
  }

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((p) => p.key !== key))

  const removeOne = (key: string) =>
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.key === key)
      if (idx === -1) return prev
      const next = [...prev]
      const row = next[idx]
      if ((row?.quantity ?? 1) > 1) {
        next[idx] = { ...row, quantity: (row.quantity ?? 1) - 1 }
      } else {
        next.splice(idx, 1)
      }
      return next
    })

  const setQuantity = (key: string, quantity: number) =>
    setItems((prev) =>
      prev.map((p) =>
        p.key === key ? { ...p, quantity: Math.max(0, quantity) } : p
      )
    )

  const clear = () => setItems([])

  return {
    items,
    addItem,
    removeItem,
    removeOne,
    setQuantity,
    clear,
    total,
    ready,
  }
}

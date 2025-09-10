import { useEffect, useMemo, useState } from 'react'

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
  const [items, setItems] = useState<CartItem[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setItems(JSON.parse(raw))
    } catch {}
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {}
  }, [items, ready])

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

  const setQuantity = (key: string, quantity: number) =>
    setItems((prev) =>
      prev.map((p) =>
        p.key === key ? { ...p, quantity: Math.max(0, quantity) } : p
      )
    )

  const clear = () => setItems([])

  return { items, addItem, removeItem, setQuantity, clear, total, ready }
}

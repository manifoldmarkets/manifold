import { NextPage } from 'next'
import { useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { ConfirmationButton } from 'web/components/buttons/confirmation-button'
import { useUser } from 'web/hooks/use-user'
import toast from 'react-hot-toast'
import { api } from 'web/lib/api/api'
import { useState as useReactState } from 'react'
import { TokenNumber } from 'web/components/widgets/token-number'
import {
  getEnabledConfigs,
  getConfigForPrintfulProduct,
} from 'common/src/shop/items'
import { useCart } from 'web/hooks/use-cart'
import type { CartItem } from 'web/hooks/use-cart'
import { useShopItemCounts } from 'web/hooks/use-shop-item-counts'
import { IoCartOutline } from 'react-icons/io5'
import { TbCrown } from 'react-icons/tb'
import { BsFire } from 'react-icons/bs'
import { Avatar } from 'web/components/widgets/avatar'
import { clearEntitlementsCache } from 'web/hooks/use-user-entitlements'
import { clearVeryRichBadgeCache } from 'web/hooks/use-very-rich-badge'
import { clearAwardInventoryCache } from 'web/hooks/use-user-award-inventory'

type ShopItem = {
  id: string
  title: string
  price: number
  imageUrl: string
  perUserLimit?: number
  globalLimit?: number
}

const DIGITAL_ITEMS: ShopItem[] = getEnabledConfigs()
  .filter((c) => c.type === 'digital')
  .map((c) => ({
    id: c.id,
    title: c.title,
    price: c.price,
    imageUrl: c.images?.[0] ?? '/logo.png',
    perUserLimit: c.perUserLimit,
    globalLimit: c.globalLimit,
  }))

const PHYSICAL_OTHER_ITEMS: ShopItem[] = getEnabledConfigs()
  .filter((c) => c.type === 'other')
  .map((c) => ({
    id: c.id,
    title: c.title,
    price: c.price,
    imageUrl: c.images?.[0] ?? '/logo.png',
    perUserLimit: c.perUserLimit,
    globalLimit: c.globalLimit,
  }))

const PRINTFUL_PRICE_MANA: Record<number, number> = Object.fromEntries(
  getEnabledConfigs()
    .filter((c) => c.type === 'printful')
    .map((c) => [c.printfulProductId as number, c.price])
)

const ShopPage: NextPage = () => {
  const user = useUser()
  const balance = user?.balance ?? 0
  const { items: cartItems, addItem } = useCart()
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({})
  const { counts: globalCounts, loading: globalCountsLoading } =
    useShopItemCounts()

  const [remote, setRemote] = useState<
    | {
        id: number
        title: string
        imageUrl: string
        variants: {
          id: number
          name: string
          retail_price?: string
          currency?: string
          size?: string
          color?: string
          preview?: string
          images?: string[]
        }[]
      }[]
    | null
  >(null)

  useEffect(() => {
    fetch('/api/printful/products')
      .then((r) => r.json())
      .then((d) => setRemote(d.products))
      .catch(() => setRemote([]))
  }, [])

  useEffect(() => {
    if (!user) {
      setOrderCounts({})
      return
    }
    api('get-shop-orders', {})
      .then((res) => {
        const counts: Record<string, number> = {}
        for (const o of res.orders ?? []) {
          counts[o.itemId] = (counts[o.itemId] ?? 0) + o.quantity
        }
        setOrderCounts(counts)
      })
      .catch(() => setOrderCounts({}))
  }, [user?.id])

  const digitalItems = useMemo(() => DIGITAL_ITEMS, [])
  const physicalOtherItems = useMemo(() => PHYSICAL_OTHER_ITEMS, [])

  return (
    <Page trackPageView="shop">
      <Col className="mx-auto max-w-6xl gap-6 p-4 sm:p-6">
        <Row className="items-center justify-between">
          <h1 className="text-2xl font-semibold">Mana Shop</h1>
          <Row className="items-center gap-2 sm:gap-3">
            <a
              href="/shop/orders"
              className="text-ink-900 hover:bg-ink-100 hidden items-center rounded-md border px-3 py-1.5 text-sm sm:inline-flex"
            >
              Orders
            </a>
            <a
              href="/shop/checkout"
              className="bg-primary-600 text-ink-0 hover:bg-primary-700 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
            >
              <IoCartOutline className="h-4 w-4" />
              <span>Cart</span>
              {cartItems.length > 0 && (
                <span className="text-xs">{cartItems.length}</span>
              )}
            </a>
          </Row>
        </Row>

        <div className="mt-2">
          <h2 className="text-ink-700 mb-3 text-lg font-medium">
            Digital Accessories
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
            {digitalItems.map((item) => (
              <SimpleItemCard
                key={item.id}
                kind="digital"
                item={item}
                balance={balance}
                cartItems={cartItems}
                addItem={addItem}
                orderCounts={orderCounts}
                globalCounts={globalCounts}
                globalCountsLoading={globalCountsLoading}
                currentUser={{
                  id: user?.id,
                  username: user?.username,
                  avatarUrl: user?.avatarUrl,
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-ink-700 mb-3 text-lg font-medium">Merch</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
            {remote === null &&
              Array.from({ length: 3 }).map((_, i) => (
                <Col
                  key={`pf-skel-${i}`}
                  className="bg-canvas-0 border-ink-200 rounded-lg border p-4 shadow-sm"
                >
                  <div className="animate-pulse">
                    <div className="bg-ink-100 aspect-square w-full rounded-md" />
                    <div className="bg-ink-100 mt-3 h-4 w-3/5 rounded" />
                    <div className="bg-ink-100 mt-2 h-6 w-1/3 rounded" />
                    <div className="bg-ink-100 mt-3 h-9 w-full rounded" />
                  </div>
                </Col>
              ))}

            {remote?.map((p) => (
              <PrintfulItemCard
                key={`printful-${p.id}`}
                p={p}
                balance={balance}
                addToCart={(ci: CartItem) => addItem(ci)}
              />
            ))}

            {physicalOtherItems.map((item) => (
              <SimpleItemCard
                key={item.id}
                kind="other"
                item={item}
                balance={balance}
                cartItems={cartItems}
                addItem={addItem}
                orderCounts={orderCounts}
                globalCounts={globalCounts}
                globalCountsLoading={globalCountsLoading}
                currentUser={{
                  id: user?.id,
                  username: user?.username,
                  avatarUrl: user?.avatarUrl,
                }}
              />
            ))}
          </div>
        </div>
      </Col>
    </Page>
  )
}

function colorToCss(c: string | undefined) {
  if (!c) return 'transparent'
  const lower = c.toLowerCase()
  const canonical = lower.replace(/-/g, ' ')
  // crude mapping for common names; fallback to the raw string for CSS named colors / hex
  const map: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#22c55e',
    yellow: '#eab308',
    orange: '#f97316',
    purple: '#a855f7',
    pink: '#ec4899',
    gray: '#6b7280',
    grey: '#6b7280',
    navy: '#1e3a8a',
    maroon: '#7f1d1d',
    teal: '#14b8a6',
    brown: '#92400e',
    // Printful-specific or multi-word named colors
    'dark grey': '#4b5563',
    forest: '#14532d',
    'true royal': '#2563eb',
    'royal blue': '#4169e1',
    'steel blue': '#4682b4',
    mint: '#98ff98',
    natural: '#ede9d5',
    'team purple': '#6d28d9',
    oxblood: '#4a0e0e',
    'oxblood black': '#4a0e0e',
    'dark navy': '#001f3f',
    olive: '#808000',
  }
  return map[canonical] ?? map[lower] ?? c
}

function colorToSwatch(c: string | undefined) {
  if (!c) return 'transparent'
  const lower = c.toLowerCase().trim()
  return colorToCss(lower)
}

export default ShopPage
function VeryRichSpent(props: { userId: string }) {
  const { userId } = props
  const [amount, setAmount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    import('web/lib/api/api').then(({ getVeryRichBadge }) => {
      getVeryRichBadge({ userId }).then((res: any) => {
        if (!cancelled) setAmount(res.amountSpentMana ?? 0)
      })
    })
    return () => {
      cancelled = true
    }
  }, [userId])
  if (amount == null) return null
  return (
    <div className="text-ink-600 text-sm">
      You’ve already burned <TokenNumber amount={amount} isInline /> on this
      badge. You can buy again to burn more mana and increase the price by{' '}
      <TokenNumber amount={100000} isInline /> for all users.
    </div>
  )
}

function SimpleItemCard(props: {
  kind: 'digital' | 'other'
  item: ShopItem
  balance: number
  cartItems: CartItem[]
  addItem: (ci: CartItem) => void
  orderCounts: Record<string, number>
  globalCounts: Record<string, number>
  globalCountsLoading: boolean
  currentUser?: { id?: string; username?: string; avatarUrl?: string }
}) {
  const {
    kind,
    item,
    balance,
    cartItems,
    addItem,
    orderCounts,
    globalCounts,
    globalCountsLoading,
    currentUser,
  } = props
  const inCart = cartItems
    .filter((ci) => ci.key === `${kind}:${item.id}`)
    .reduce((a, b) => a + b.quantity, 0)
  const existing = orderCounts[item.id] ?? 0
  const atUserLimit =
    !!item.perUserLimit && existing + inCart >= item.perUserLimit

  // Check global limit
  const globalCount = globalCounts[item.id] ?? 0
  const globalLimit = item.globalLimit
  const atGlobalLimit = !!globalLimit && globalCount >= globalLimit
  const remaining = globalLimit ? globalLimit - globalCount : undefined

  const atLimit = atUserLimit || atGlobalLimit
  const isVeryRich = item.id === 'very-rich-badge'
  const purchasedCount = globalCounts[item.id] ?? 0
  const currentDynamicPrice = isVeryRich
    ? 100000 + purchasedCount * 100000
    : item.price
  return (
    <Col className="bg-canvas-0 border-ink-200 rounded-lg border p-4 shadow-sm">
      <div className="bg-ink-100 aspect-square w-full overflow-hidden rounded-md">
        {item.id === 'golden-crown' && (
          <Row className="relative h-full w-full items-center justify-center">
            {/* Gold ring preview */}
            <div className="relative">
              <Avatar
                username={currentUser?.username}
                avatarUrl={currentUser?.avatarUrl}
                size="xl"
                noLink
                className="ring-2 ring-yellow-400"
              />
              {/* Crown overlay scaled for xl avatar */}
              <div className="absolute -right-6 -top-4">
                <TbCrown className="h-11 w-11 rotate-45 text-yellow-400" />
              </div>
            </div>
          </Row>
        )}
        {item.id === 'very-rich-badge' && (
          <Row className="h-full w-full items-center justify-center">
            <BsFire className="h-24 w-24 text-orange-500" />
          </Row>
        )}
        {item.id !== 'golden-crown' && item.id !== 'very-rich-badge' && (
          <img
            src={item.imageUrl}
            alt={item.title}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <Row className="items-center justify-between">
        <div className="text-ink-600 mt-3 text-sm">{item.title}</div>
        {globalLimit && !globalCountsLoading && (
          <div
            className={`mt-3 text-xs ${
              atGlobalLimit ? 'text-red-600' : 'text-amber-600'
            }`}
          >
            {atGlobalLimit ? 'Sold out' : `${remaining} remaining`}
          </div>
        )}
        {globalCountsLoading && globalLimit && (
          <div className="text-ink-400 mt-3 text-xs">Loading...</div>
        )}
      </Row>
      <div className="text-lg font-medium">
        <TokenNumber amount={currentDynamicPrice} isInline />
      </div>

      <ConfirmationButton
        openModalBtn={{
          label: isVeryRich
            ? 'Buy more'
            : atGlobalLimit
            ? 'Sold Out'
            : atUserLimit
            ? 'Purchased'
            : 'Buy',
          color: 'indigo',
          className: 'mt-3 w-full',
          disabled: atLimit,
        }}
        cancelBtn={{ label: 'Cancel' }}
        submitBtn={{
          label: kind === 'digital' ? 'Buy now' : 'Add to Cart',
          color: 'indigo',
        }}
        onSubmitWithSuccess={async () => {
          if (item.perUserLimit && item.perUserLimit <= 0) {
            toast.error('This item is not currently available')
            return false
          }
          if (kind === 'digital') {
            try {
              await api('checkout-shop-cart', {
                items: [{ key: `${kind}:${item.id}`, quantity: 1 }],
              })
              toast.success('Purchase complete')

              // Clear cache so new purchase shows immediately
              if (currentUser?.id) {
                if (item.id === 'golden-crown') {
                  clearEntitlementsCache(currentUser.id)
                } else if (item.id === 'very-rich-badge') {
                  clearVeryRichBadgeCache(currentUser.id)
                } else if (
                  item.id === 'award-plus' ||
                  item.id === 'award-premium' ||
                  item.id === 'award-crystal'
                ) {
                  clearAwardInventoryCache()
                }
              }

              return true
            } catch (_e) {
              toast.error('Purchase failed')
              return false
            }
          } else {
            // physical/other -> add to cart
            const inCartNow = cartItems
              .filter((ci) => ci.key === `${kind}:${item.id}`)
              .reduce((a, b) => a + b.quantity, 0)
            const existingNow = orderCounts[item.id] ?? 0
            if (
              item.perUserLimit &&
              existingNow + inCartNow >= item.perUserLimit
            ) {
              toast.error(`Limit ${item.perUserLimit} per user`)
              return false
            }
            addItem({
              key: `${kind}:${item.id}`,
              title: item.title,
              imageUrl: item.imageUrl,
              price: currentDynamicPrice,
              quantity: 1,
            })
            toast.success('Added to cart')
            return true
          }
        }}
      >
        <Col className="gap-2">
          <div className="text-md font-medium">Confirm purchase</div>
          <div className="text-ink-700 text-sm">{item.title}</div>
          <div className="text-sm">
            Price: <TokenNumber amount={currentDynamicPrice} isInline />
          </div>
          {isVeryRich && currentUser?.id && (
            <VeryRichSpent userId={currentUser.id} />
          )}
          <div className="text-sm">
            Balance change: <TokenNumber amount={balance} isInline /> →{' '}
            <TokenNumber amount={balance - currentDynamicPrice} isInline />
          </div>
        </Col>
      </ConfirmationButton>
    </Col>
  )
}

function PrintfulItemCard(props: {
  p: {
    id: number
    title: string
    imageUrl: string
    variants: {
      id: number
      name: string
      retail_price?: string
      currency?: string
      size?: string
      color?: string
      preview?: string
      images?: string[]
    }[]
  }
  balance: number
  addToCart: (item: CartItem) => void
}) {
  const { p, balance, addToCart } = props
  const priceMana = PRINTFUL_PRICE_MANA[p.id]
  const sizes = Array.from(
    new Set(p.variants.map((v) => v.size).filter(Boolean))
  ) as string[]
  const colors = Array.from(
    new Set(
      p.variants
        .map((v) => v.color)
        .filter((c): c is string => Boolean(c) && !isSizeToken(c as string))
    )
  ) as string[]

  const sizesForColor = (c?: string) =>
    Array.from(
      new Set(
        p.variants
          .filter((v) => (c ? v.color === c : true))
          .map((v) => v.size)
          .filter(Boolean)
      )
    ) as string[]

  const [selectedColor, setSelectedColor] = useReactState<string | undefined>(
    colors[0]
  )
  const [selectedSize, setSelectedSize] = useReactState<string | undefined>(
    undefined
  )

  const findExact = p.variants.find(
    (v) =>
      (selectedColor ? v.color === selectedColor : true) &&
      (selectedSize ? v.size === selectedSize : true)
  )
  const findByColor = selectedColor
    ? p.variants.find((v) => v.color === selectedColor)
    : undefined
  const findBySize = selectedSize
    ? p.variants.find((v) => v.size === selectedSize)
    : undefined
  const matchingVariant =
    findExact ?? findByColor ?? findBySize ?? p.variants[0]

  const gallery = dedupe(
    (matchingVariant?.images ?? []).concat(
      matchingVariant?.preview ? [matchingVariant.preview] : []
    )
  )
  const modalPreview =
    gallery[0] ?? (matchingVariant as any)?.preview ?? p.imageUrl

  return (
    <Col className="bg-canvas-0 border-ink-200 gap-2 rounded-lg border p-4 shadow-sm">
      <div className="bg-ink-100 aspect-square w-full overflow-hidden rounded-md">
        <img
          src={p.imageUrl}
          alt={p.title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="text-ink-600 mt-3 text-sm">{p.title}</div>
      <div className="text-lg font-medium">
        {priceMana == null ? '—' : <TokenNumber amount={priceMana} isInline />}
      </div>

      <ConfirmationButton
        openModalBtn={{
          label: 'See Options',
          color: 'indigo',
          className: 'mt-2 w-full',
        }}
        cancelBtn={{ label: 'Cancel' }}
        submitBtn={{
          label: 'Add to Cart',
          color: 'indigo',
          isSubmitting: false,
          disabled: !selectedSize || priceMana == null,
        }}
        onOpenChanged={(open) => {
          if (!open) return
          // Reset to first available on open so user starts from a valid selection
          setSelectedColor(colors[0])
          // Leave size unselected by default
          setSelectedSize(undefined)
        }}
        onSubmitWithSuccess={async () => {
          if (priceMana == null || !matchingVariant) return false
          const cfg = getConfigForPrintfulProduct(p.id)
          const limit = cfg?.perUserLimit
          if (limit && limit <= 0) {
            toast.error('This item is not currently available')
            return false
          }
          const inCart = (
            typeof window !== 'undefined'
              ? JSON.parse(localStorage.getItem('shop_cart_v1') || '[]')
              : []
          )
            .filter(
              (ci: any) =>
                typeof ci?.key === 'string' &&
                ci.key.startsWith(`printful:${p.id}:`)
            )
            .reduce((a: number, b: any) => a + (b.quantity ?? 0), 0)
          if (limit && inCart >= limit) {
            toast.error(`Limit ${limit} per user`)
            return false
          }
          addToCart({
            key: `printful:${p.id}:${matchingVariant.id}`,
            title: `${p.title}${selectedSize ? ` (${selectedSize})` : ''}${
              selectedColor ? ` - ${selectedColor}` : ''
            }`,
            imageUrl: (matchingVariant as any)?.preview ?? p.imageUrl,
            price: priceMana,
            quantity: 1,
            meta: {
              productId: p.id,
              variantId: matchingVariant.id,
              size: selectedSize,
              color: selectedColor,
            },
          })
          toast.success('Added to cart')
          return true
        }}
      >
        <Col className="gap-2">
          <div className="bg-ink-100 aspect-square w-full overflow-hidden rounded-md">
            <img
              src={modalPreview}
              alt={p.title}
              className="h-full w-full object-cover"
            />
          </div>
          {gallery.length > 1 && (
            <div className="-mx-1 flex flex-wrap gap-2">
              {gallery.slice(0, 8).map((img) => (
                <button
                  key={img}
                  onClick={() => {
                    // swap primary preview
                    const idx = gallery.indexOf(img)
                    if (idx > 0) {
                      const newGallery = [img].concat(
                        gallery.filter((g) => g !== img)
                      )
                      ;(matchingVariant as any).images = newGallery
                    }
                  }}
                  className="h-14 w-14 overflow-hidden rounded border"
                >
                  <img
                    src={img}
                    alt="thumb"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
          <div className="text-md font-medium">Select options</div>
          {colors.length > 0 && (
            <div className="text-sm">
              <div className="mb-1">Color</div>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setSelectedColor(c)
                      const avail = sizesForColor(c)
                      if (selectedSize && !avail.includes(selectedSize)) {
                        setSelectedSize(undefined)
                      }
                    }}
                    className={
                      'flex items-center gap-2 rounded px-2 py-1 text-xs ' +
                      (selectedColor === c
                        ? 'bg-primary-600 text-white'
                        : 'bg-ink-100 text-ink-800')
                    }
                  >
                    <span className="h-3 w-3 rounded-sm border bg-white">
                      <span
                        className="block h-full w-full"
                        style={{ background: colorToSwatch(c) }}
                      />
                    </span>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sizes.length > 0 && (
            <div className="text-sm">
              <div className="mb-1">Size</div>
              <div className="flex flex-wrap gap-2">
                {(selectedColor ? sizesForColor(selectedColor) : sizes).map(
                  (s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSize(s)}
                      className={
                        'rounded px-2 py-1 text-xs ' +
                        (selectedSize === s
                          ? 'bg-primary-600 text-white'
                          : 'bg-ink-100 text-ink-800')
                      }
                    >
                      {s}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
          <div className="text-sm">
            Price:{' '}
            {priceMana == null ? (
              '—'
            ) : (
              <TokenNumber amount={priceMana} isInline />
            )}
          </div>
          {(() => {
            const cfg = getConfigForPrintfulProduct(p.id)
            const limit = cfg?.perUserLimit
            return limit ? (
              <div className="text-ink-600 text-xs">Limit {limit} per user</div>
            ) : null
          })()}
          <div className="text-sm">
            {priceMana == null ? (
              'Balance change: —'
            ) : (
              <>
                Balance change: <TokenNumber amount={balance} isInline /> →{' '}
                <TokenNumber amount={balance - priceMana} isInline />
              </>
            )}
          </div>
        </Col>
      </ConfirmationButton>
    </Col>
  )
}

function dedupe<T>(arr: T[]): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}

function isSizeToken(token: string): boolean {
  const t = token.trim().toUpperCase()
  const set = new Set([
    'XS',
    'S',
    'M',
    'L',
    'XL',
    '2XL',
    '3XL',
    '4XL',
    '5XL',
    'ONE',
    'ONE SIZE',
    'OSFA',
    'OSFM',
    'S/M',
    'M/L',
    'L/XL',
  ])
  return set.has(t)
}

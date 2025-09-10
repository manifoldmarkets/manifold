import { NextPage } from 'next'
import { useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { ConfirmationButton } from 'web/components/buttons/confirmation-button'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import toast from 'react-hot-toast'
import { useState as useReactState } from 'react'

type ShopItem = {
  id: string
  title: string
  price: number
  imageUrl: string
}

const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'digital-sticker-pack',
    title: 'Digital Sticker Pack',
    price: 100,
    imageUrl: '/logo.png',
  },
  {
    id: 'profile-frame',
    title: 'Profile Frame',
    price: 250,
    imageUrl: '/favicon.ico',
  },
  {
    id: 'username-glow',
    title: 'Username Glow',
    price: 500,
    imageUrl: '/promo/promo-1.png',
  },
  {
    id: 'supporter-badge',
    title: 'Supporter Badge',
    price: 1000,
    imageUrl: '/promo/promo-2.png',
  },
]

const ShopPage: NextPage = () => {
  const user = useUser()
  const balance = user?.balance ?? 0
  const [loadingId, setLoadingId] = useState<string | null>(null)

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

  const items = useMemo(() => SHOP_ITEMS, [])

  return (
    <Page trackPageView="shop">
      <Col className="mx-auto max-w-6xl gap-6 p-4 sm:p-6">
        <Row className="items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Mana Shop</h1>
          <div className="text-ink-700">
            Balance: M${balance.toLocaleString()}
          </div>
        </Row>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {remote?.map((p) => (
            <PrintfulItemCard
              key={`printful-${p.id}`}
              p={p}
              balance={balance}
              userPresent={!!user}
              loadingId={loadingId}
              setLoadingId={setLoadingId}
            />
          ))}
          {items.map((item) => (
            <Col
              key={item.id}
              className="bg-canvas-0 border-ink-200 rounded-lg border p-4 shadow-sm"
            >
              <div className="bg-ink-100 aspect-square w-full overflow-hidden rounded-md">
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="text-ink-600 mt-3 text-sm">{item.title}</div>
              <div className="text-lg font-medium">
                M${item.price.toLocaleString()}
              </div>

              <ConfirmationButton
                openModalBtn={{
                  label: 'Buy',
                  color: 'indigo',
                  className: 'mt-3 w-full',
                }}
                cancelBtn={{ label: 'Cancel' }}
                submitBtn={{
                  label: 'Confirm',
                  color: 'indigo',
                  isSubmitting: loadingId === item.id,
                }}
                onSubmitWithSuccess={async () => {
                  if (!user) {
                    toast.error('Please sign in to purchase')
                    return false
                  }
                  if (balance < item.price) {
                    toast.error('Insufficient balance')
                    return false
                  }
                  try {
                    setLoadingId(item.id)
                    await api('purchase-shop-item', {
                      itemId: item.id,
                      price: item.price,
                    })
                    toast.success('Purchase successful')
                    return true
                  } catch (e: any) {
                    toast.error(e?.message ?? 'Purchase failed')
                    return false
                  } finally {
                    setLoadingId(null)
                  }
                }}
              >
                <Col className="gap-2">
                  <div className="text-md font-medium">Confirm purchase</div>
                  <div className="text-ink-700 text-sm">{item.title}</div>
                  <div className="text-sm">
                    Price: M${item.price.toLocaleString()}
                  </div>
                  <div className="text-sm">
                    Balance change: M${balance.toLocaleString()} → M$
                    {(balance - item.price).toLocaleString()}
                  </div>
                </Col>
              </ConfirmationButton>
            </Col>
          ))}
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
  // Treat as split color only if explicitly contains '/' or ends with ' black' or ' white'
  if (lower.includes('/')) {
    const parts = lower
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      const first = colorToCss(parts[0])
      const last = colorToCss(parts[parts.length - 1])
      return `linear-gradient(90deg, ${first} 0%, ${first} 50%, ${last} 50%, ${last} 100%)`
    }
  }
  if (/(\sblack$|\swhite$)/.test(lower)) {
    const tokens = lower.split(/\s+/)
    const first = colorToCss(tokens[0])
    const last = colorToCss(tokens[tokens.length - 1])
    return `linear-gradient(90deg, ${first} 0%, ${first} 50%, ${last} 50%, ${last} 100%)`
  }
  return colorToCss(lower)
}

export default ShopPage

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
  userPresent: boolean
  loadingId: string | null
  setLoadingId: (id: string | null) => void
}) {
  const { p, balance, userPresent, loadingId, setLoadingId } = props
  const firstPrice = p.variants.find((v) => v.retail_price)
  const basePrice = firstPrice ? Number(firstPrice.retail_price) : 0
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

  const price = matchingVariant?.retail_price
    ? Number(matchingVariant.retail_price)
    : basePrice
  const gallery = dedupe(
    (matchingVariant?.images ?? []).concat(
      matchingVariant?.preview ? [matchingVariant.preview] : []
    )
  )
  const modalPreview =
    gallery[0] ?? (matchingVariant as any)?.preview ?? p.imageUrl

  return (
    <Col className="bg-canvas-0 border-ink-200 rounded-lg border p-4 shadow-sm">
      <div className="bg-ink-100 aspect-square w-full overflow-hidden rounded-md">
        <img
          src={p.imageUrl}
          alt={p.title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="text-ink-600 mt-3 text-sm">{p.title}</div>
      <div className="text-lg font-medium">
        {matchingVariant?.currency ?? firstPrice?.currency ?? 'USD'}{' '}
        {matchingVariant?.retail_price ?? firstPrice?.retail_price ?? '—'}
      </div>

      <ConfirmationButton
        openModalBtn={{
          label: 'Buy',
          color: 'indigo',
          className: 'mt-3 w-full',
        }}
        cancelBtn={{ label: 'Cancel' }}
        submitBtn={{
          label: 'Confirm',
          color: 'indigo',
          isSubmitting: loadingId === `pf-${p.id}`,
          disabled: !selectedSize,
        }}
        onOpenChanged={(open) => {
          if (!open) return
          // Reset to first available on open so user starts from a valid selection
          setSelectedColor(colors[0])
          // Leave size unselected by default
          setSelectedSize(undefined)
        }}
        onSubmitWithSuccess={async () => {
          if (!userPresent) {
            toast.error('Please sign in to purchase')
            return false
          }
          if (balance < price) {
            toast.error('Insufficient balance')
            return false
          }
          try {
            setLoadingId(`pf-${p.id}`)
            // For now still burn mana only; when we fulfill, include variant id
            await api('purchase-shop-item', {
              itemId: `printful:${p.id}:${matchingVariant?.id ?? 'base'}`,
              price,
            })
            toast.success('Purchase successful')
            return true
          } catch (e: any) {
            toast.error(e?.message ?? 'Purchase failed')
            return false
          } finally {
            setLoadingId(null)
          }
        }}
      >
        <Col className="gap-3">
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
            {(matchingVariant?.currency ?? firstPrice?.currency ?? 'USD') +
              ' ' +
              (matchingVariant?.retail_price ??
                firstPrice?.retail_price ??
                '—')}
          </div>
          <div className="text-sm">
            Balance change: M${balance.toLocaleString()} → M$
            {(balance - price).toLocaleString()}
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

// sizesForColor defined inside component where variants are available

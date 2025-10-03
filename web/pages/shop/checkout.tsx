import { NextPage } from 'next'
import { useEffect, useMemo, useState } from 'react'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useCart } from 'web/hooks/use-cart'
import { TokenNumber } from 'web/components/widgets/token-number'
import { api } from 'web/lib/api/api'
import toast from 'react-hot-toast'

const CheckoutPage: NextPage = () => {
  const { items, clear, removeOne: removeOneFromCart } = useCart()
  const { digital, other, printful, total, displayItems } = useMemo(() => {
    const digital = items.filter((i) => i.key.startsWith('digital:'))
    const other = items.filter((i) => i.key.startsWith('other:'))
    const printful = items.filter((i) => i.key.startsWith('printful:'))
    const displayItems = items.flatMap((i) =>
      Array.from({ length: i.quantity }).map((_, idx) => ({
        ...i,
        key: `${i.key}#${idx}`,
      }))
    )
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
    return { digital, other, printful, total, displayItems }
  }, [items])

  const [recipient, setRecipient] = useState({
    name: '',
    email: '',
    address1: '',
    address2: '',
    city: '',
    state_code: '',
    country_code: 'US',
    zip: '',
  })
  const [countries, setCountries] = useState<
    { code: string; name: string; states: { code: string; name: string }[] }[]
  >([])
  const requiresState = ['US', 'CA', 'AU', 'JP'].includes(
    recipient.country_code
  )
  const statesForCountry = (countries.find(
    (c) => c.code === recipient.country_code
  )?.states ?? []) as { code: string; name: string }[]
  const hasPrintful = printful.length > 0
  const shippingValid = !hasPrintful
    ? true
    : Boolean(
        recipient.name &&
          recipient.email &&
          recipient.address1 &&
          recipient.city &&
          (!requiresState || recipient.state_code) &&
          recipient.country_code &&
          recipient.country_code.length === 2 &&
          recipient.zip
      )

  const checkout = async () => {
    try {
      if (hasPrintful) {
        if (!shippingValid) {
          toast.error('Please complete shipping details')
          return
        }
        const pfItems = printful.map((ci) => ({
          productId: Number(
            (ci.meta as any)?.productId ?? String(ci.key).split(':')[1]
          ),
          variantId: Number(
            (ci.meta as any)?.variantId ?? String(ci.key).split(':')[2]
          ),
          quantity: ci.quantity,
          size: (ci.meta as any)?.size,
          color: (ci.meta as any)?.color,
        }))
        await api('checkout-printful', { recipient, items: pfItems })
      }
      if (digital.length + other.length > 0) {
        const payload = {
          items: digital
            .concat(other)
            .map((ci) => ({ key: ci.key, quantity: ci.quantity })),
        }
        const res = await api('checkout-shop-cart', payload)
        toast.success(`Processed ${res.processed} digital item(s)`)
      }
      clear()
    } catch (e: any) {
      const raw =
        typeof e === 'string' ? e : e?.message || e?.error || e?.data?.message
      const msg = String(raw || '')
      let friendly = msg || 'Checkout failed'
      if (/one physical goods order every 30 days/i.test(msg))
        friendly = 'You can order physical merch once every 30 days.'
      else if (/at most 3 physical items per order|cart is full/i.test(msg))
        friendly = 'Cart limit reached: max 3 physical items.'
      else if (/already own .* has not yet expired/i.test(msg))
        friendly = "You already own this item and it's still active."
      else if (/insufficient balance/i.test(msg))
        friendly = 'Insufficient balance.'
      else {
        const mMonthly = msg.match(/limit\s+(\d+)\s+per\s+month/i)
        if (mMonthly) friendly = `Limit ${mMonthly[1]} per month for this item.`
        const mUser = msg.match(/limit\s+(\d+)\s+per\s+user/i)
        if (mUser) friendly = `Limit ${mUser[1]} total per user for this item.`
      }
      toast.error(friendly)
    }
  }

  const removeOne = (displayKey: string) => {
    const baseKey = displayKey.split('#')[0]
    removeOneFromCart(baseKey)
  }

  // Load countries/subdivisions from our cached API (backend endpoint)
  useEffect(() => {
    api('get-printful-geo', {})
      .then((d) => setCountries((d as any).countries ?? []))
      .catch((e) => {
        console.error('Failed to load countries', e)
        setCountries([])
        toast.error('Failed to load countries')
      })
  }, [])

  return (
    <Page trackPageView="shop-checkout">
      <Col className="mx-auto w-full max-w-3xl gap-6 p-4 sm:p-6">
        <Row className="mb-4 w-full items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <a href="/shop" className="text-primary-600 text-sm hover:underline">
            Continue shopping
          </a>
        </Row>

        <Col className="w-full gap-4">
          {displayItems.length === 0 ? (
            <Row className="w-full justify-between gap-4 p-4 ">
              <div className="text-ink-600 text-sm">Your cart is empty.</div>
            </Row>
          ) : (
            displayItems.map((i) => {
              const size = i.meta?.size as string | undefined
              const color = i.meta?.color as string | undefined
              return (
                <Row key={i.key} className="w-full justify-between gap-4 py-3 ">
                  <Row className="items-start gap-3">
                    <div className="bg-ink-100 h-16 w-16 overflow-hidden rounded">
                      {i.imageUrl ? (
                        <img
                          src={i.imageUrl}
                          alt="thumb"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full" />
                      )}
                    </div>
                    <Col className="gap-1">
                      <div className="text-sm font-medium">{i.title}</div>
                      {color && (
                        <div className="text-ink-700 text-xs">
                          Color: {color}
                        </div>
                      )}
                      {size && (
                        <div className="text-ink-700 text-xs">Size: {size}</div>
                      )}
                    </Col>
                  </Row>
                  <Col className="items-end gap-1">
                    <div className="text-sm">
                      <TokenNumber amount={i.price} isInline />
                    </div>
                    <button
                      onClick={() => removeOne(i.key)}
                      className="text-ink-700 hover:text-ink-900 rounded px-2 py-1 text-xs"
                    >
                      Remove
                    </button>
                  </Col>
                </Row>
              )
            })
          )}
          {items.length > 0 && (
            <Row className="items-center justify-between py-2">
              <div className="text-ink-700 text-sm">Total</div>
              <div className="text-lg font-medium">
                <TokenNumber amount={total} isInline />
              </div>
            </Row>
          )}
        </Col>

        {hasPrintful && (
          <Col className="w-full gap-4 p-0">
            <div className="text-md font-medium">Shipping information</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Col>
                <label className="text-ink-700 mb-1 text-sm font-medium">
                  Full name <span className="text-red-600">*</span>
                </label>
                <input
                  className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                  value={recipient.name}
                  onChange={(e) =>
                    setRecipient({ ...recipient, name: e.target.value })
                  }
                  aria-required
                />
              </Col>
              <Col>
                <label className="text-ink-700 mb-1 text-sm font-medium">
                  Email <span className="text-red-600">*</span>
                </label>
                <input
                  className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                  value={recipient.email}
                  onChange={(e) =>
                    setRecipient({ ...recipient, email: e.target.value })
                  }
                  aria-required
                />
              </Col>
              <Col className="sm:col-span-2">
                <label className="text-ink-700 mb-1 text-sm font-medium">
                  Address line 1 <span className="text-red-600">*</span>
                </label>
                <input
                  className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                  value={recipient.address1}
                  onChange={(e) =>
                    setRecipient({ ...recipient, address1: e.target.value })
                  }
                  aria-required
                />
              </Col>
              <Col className="sm:col-span-2">
                <label className="text-ink-700 mb-1 text-sm font-medium">
                  Address line 2 (optional)
                </label>
                <input
                  className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                  value={recipient.address2}
                  onChange={(e) =>
                    setRecipient({ ...recipient, address2: e.target.value })
                  }
                />
              </Col>
              <Col>
                <label className="text-ink-700 mb-1 text-sm font-medium">
                  Country <span className="text-red-600">*</span>
                </label>
                <select
                  className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                  value={recipient.country_code}
                  onChange={(e) =>
                    setRecipient({
                      ...recipient,
                      country_code: e.target.value.toUpperCase(),
                      state_code: '',
                    })
                  }
                >
                  {countries.map((c) => (
                    <option
                      key={c.code}
                      value={c.code}
                      className="bg-canvas-0 text-ink-900"
                    >
                      {c.name}
                    </option>
                  ))}
                </select>
              </Col>
              <Col>
                <label className="text-ink-700 mb-1 text-sm font-medium">
                  City <span className="text-red-600">*</span>
                </label>
                <input
                  className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                  value={recipient.city}
                  onChange={(e) =>
                    setRecipient({ ...recipient, city: e.target.value })
                  }
                  aria-required
                />
              </Col>
              <Col>
                <label className="text-ink-700 mb-1 text-sm font-medium">
                  State / Region / Prefecture{' '}
                  {requiresState && <span className="text-red-600">*</span>}
                </label>
                {requiresState ? (
                  <select
                    className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                    value={recipient.state_code}
                    onChange={(e) =>
                      setRecipient({
                        ...recipient,
                        state_code: e.target.value.toUpperCase(),
                      })
                    }
                  >
                    <option value="" className="bg-canvas-0 text-ink-900">
                      Select state/region
                    </option>
                    {statesForCountry.map((s) => (
                      <option
                        key={s.code}
                        value={s.code}
                        className="bg-canvas-0 text-ink-900"
                      >
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                    value={recipient.state_code}
                    onChange={(e) =>
                      setRecipient({ ...recipient, state_code: e.target.value })
                    }
                  />
                )}
              </Col>
              {/* Country handled above as select */}
              <Col>
                <label className="text-ink-700 mb-1 text-sm font-medium">
                  ZIP / Postal code <span className="text-red-600">*</span>
                </label>
                <input
                  className="border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md border bg-transparent p-2 text-sm focus:outline-none focus:ring-2"
                  value={recipient.zip}
                  onChange={(e) =>
                    setRecipient({ ...recipient, zip: e.target.value })
                  }
                  aria-required
                />
              </Col>
              {/* Phone omitted; Printful accepts email for updates, phone is optional */}
            </div>
          </Col>
        )}

        <Row className="justify-end gap-2 pt-2">
          <a
            href="/shop"
            className="hover:bg-ink-100 rounded px-3 py-2 text-sm"
          >
            Back
          </a>
          <button
            onClick={checkout}
            disabled={hasPrintful && !shippingValid}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-ink-300 text-ink-0 rounded px-4 py-2 text-sm"
          >
            Pay now
          </button>
        </Row>
      </Col>
    </Page>
  )
}

export default CheckoutPage

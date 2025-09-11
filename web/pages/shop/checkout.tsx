import { NextPage } from 'next'
import { useMemo, useState } from 'react'
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
    phone: '',
  })
  const hasPrintful = printful.length > 0
  const shippingValid = !hasPrintful
    ? true
    : Boolean(
        recipient.name &&
          recipient.email &&
          recipient.address1 &&
          recipient.city &&
          recipient.state_code &&
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
      toast.error(e?.message ?? 'Checkout failed')
    }
  }

  const removeOne = (displayKey: string) => {
    const baseKey = displayKey.split('#')[0]
    removeOneFromCart(baseKey)
  }

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
                <Row key={i.key} className="w-full justify-between gap-4 p-4 ">
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
            <Row className="items-center justify-between  p-4">
              <div className="text-ink-700 text-sm">Subtotal</div>
              <div className="text-lg font-medium">
                <TokenNumber amount={total} isInline />
              </div>
            </Row>
          )}
        </Col>

        {hasPrintful && (
          <Col className="w-full gap-3 rounded-md border p-4">
            <div className="text-md font-medium">Shipping information</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="rounded border p-2 text-sm"
                placeholder="Full name"
                value={recipient.name}
                onChange={(e) =>
                  setRecipient({ ...recipient, name: e.target.value })
                }
              />
              <input
                className="rounded border p-2 text-sm"
                placeholder="Email"
                value={recipient.email}
                onChange={(e) =>
                  setRecipient({ ...recipient, email: e.target.value })
                }
              />
              <input
                className="rounded border p-2 text-sm sm:col-span-2"
                placeholder="Address line 1"
                value={recipient.address1}
                onChange={(e) =>
                  setRecipient({ ...recipient, address1: e.target.value })
                }
              />
              <input
                className="rounded border p-2 text-sm sm:col-span-2"
                placeholder="Address line 2 (optional)"
                value={recipient.address2}
                onChange={(e) =>
                  setRecipient({ ...recipient, address2: e.target.value })
                }
              />
              <input
                className="rounded border p-2 text-sm"
                placeholder="City"
                value={recipient.city}
                onChange={(e) =>
                  setRecipient({ ...recipient, city: e.target.value })
                }
              />
              <input
                className="rounded border p-2 text-sm"
                placeholder="State / Region"
                value={recipient.state_code}
                onChange={(e) =>
                  setRecipient({ ...recipient, state_code: e.target.value })
                }
              />
              <input
                className="rounded border p-2 text-sm"
                placeholder="Country code (e.g., US)"
                value={recipient.country_code}
                onChange={(e) =>
                  setRecipient({
                    ...recipient,
                    country_code: e.target.value.toUpperCase(),
                  })
                }
              />
              <input
                className="rounded border p-2 text-sm"
                placeholder="ZIP / Postal code"
                value={recipient.zip}
                onChange={(e) =>
                  setRecipient({ ...recipient, zip: e.target.value })
                }
              />
              <input
                className="rounded border p-2 text-sm sm:col-span-2"
                placeholder="Phone (optional)"
                value={recipient.phone}
                onChange={(e) =>
                  setRecipient({ ...recipient, phone: e.target.value })
                }
              />
            </div>
          </Col>
        )}

        <Row className="justify-end gap-2">
          <a
            href="/shop"
            className="bg-ink-100 hover:bg-ink-200 rounded px-3 py-2 text-sm"
          >
            Back
          </a>
          <button
            onClick={checkout}
            disabled={hasPrintful && !shippingValid}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-ink-300 text-ink-0 rounded px-3 py-2 text-sm"
          >
            Pay now
          </button>
        </Row>
      </Col>
    </Page>
  )
}

export default CheckoutPage

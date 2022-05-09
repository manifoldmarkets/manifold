import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { FundsSelector } from 'web/components/yes-no-selector'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Page } from 'web/components/page'

export default function AddFundsPage() {
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<1000 | 2500 | 10000>(
    2500
  )

  return (
    <Page>
      <SEO title="Add funds" description="Add funds" url="/add-funds" />

      <Col className="items-center">
        <Col className="h-full rounded bg-white p-4 py-8 sm:p-8 sm:shadow-md">
          <Title className="!mt-0" text="Get Manifold Dollars" />
          <img
            className="mb-6 block -scale-x-100 self-center"
            src="/stylized-crane-black.png"
            width={200}
            height={200}
          />

          <div className="mb-6 text-gray-500">
            Use Manifold Dollars to trade in your favorite markets. <br /> (Not
            redeemable for cash.)
          </div>

          <div className="mb-2 text-sm text-gray-500">Amount</div>
          <FundsSelector
            className="max-w-md"
            selected={amountSelected}
            onSelect={setAmountSelected}
          />

          <div className="mt-6">
            <div className="mb-1 text-sm text-gray-500">Price USD</div>
            <div className="text-xl">
              ${Math.round(amountSelected / 100)}.00
            </div>
          </div>

          <form
            action={checkoutURL(user?.id || '', amountSelected)}
            method="POST"
            className="mt-8"
          >
            <button
              type="submit"
              className="btn btn-primary w-full bg-gradient-to-r from-teal-500 to-green-500 font-medium hover:from-teal-600 hover:to-green-600"
            >
              Checkout
            </button>
          </form>
        </Col>
      </Col>
    </Page>
  )
}

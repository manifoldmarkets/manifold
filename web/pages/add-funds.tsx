import { useState } from 'react'
import { Col } from '../components/layout/col'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { FundsSelector } from '../components/yes-no-selector'
import { useUser } from '../hooks/use-user'
import { checkoutURL } from '../lib/service/stripe'
import { Page } from '../components/page'

export default function AddFundsPage() {
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<
    500 | 1000 | 2500 | 10000
  >(500)

  return (
    <Page>
      <SEO title="Add funds" description="Add funds" url="/add-funds" />

      <Col className="items-center">
        <Col className="bg-white rounded sm:shadow-md p-4 py-8 sm:p-8 h-full">
          <Title className="!mt-0" text="Get Manifold Dollars" />
          <img
            className="mb-6 block self-center -scale-x-100"
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

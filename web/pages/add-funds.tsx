import { useState } from 'react'
import { Col } from '../components/layout/col'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { FundsSelector } from '../components/yes-no-selector'
import { useUser } from '../hooks/use-user'
import { checkoutURL } from '../lib/service/stripe'
import Image from 'next/image'
import { Spacer } from '../components/layout/spacer'
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
        <Col>
          <Title text="Get Mantic Dollars" />
          <Image
            className="block mt-6"
            src="/praying-mantis-light.svg"
            width={200}
            height={200}
          />

          <div className="text-gray-500 mb-6">
            Use Mantic Dollars to trade in your favorite markets. <br /> (Not
            redeemable for cash.)
          </div>

          <div className="text-gray-500 text-sm mb-2">Amount</div>
          <FundsSelector
            className="max-w-md"
            selected={amountSelected}
            onSelect={setAmountSelected}
          />

          <div className="mt-6">
            <div className="text-gray-500 text-sm mb-1">Price USD</div>
            <div className="text-xl">
              ${Math.round(amountSelected / 100)}.00
            </div>
          </div>

          <form
            action={checkoutURL(user?.id || '', amountSelected)}
            method="POST"
            className="mt-12"
          >
            <button
              type="submit"
              className="btn btn-primary w-full font-medium bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600"
            >
              Checkout
            </button>
          </form>
        </Col>
      </Col>
    </Page>
  )
}

import { useState } from 'react'
import { Header } from '../components/header'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { FundsSelector } from '../components/yes-no-selector'
import { useUser } from '../hooks/use-user'
import { checkoutURL } from '../lib/service/stripe'

export default function AddFundsPage() {
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<
    500 | 1000 | 2500 | 10000
  >(500)

  return (
    <div className="max-w-4xl px-4 pb-8 mx-auto">
      <SEO title="Add funds" description="Add funds" url="/add-funds" />
      <Header />

      <Title text="Get Mantic Dollars" />

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
        <div>${Math.round(amountSelected / 100)}.00</div>
      </div>

      <form
        action={checkoutURL(user?.id || '', amountSelected)}
        method="POST"
        className="mt-6"
      >
        <button type="submit" className="btn btn-primary">
          Checkout
        </button>
      </form>
    </div>
  )
}

import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { FundsSelector } from 'web/components/yes-no-selector'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Page } from 'web/components/page'
import { useTracking } from 'web/hooks/use-tracking'
import { trackCallback } from 'web/lib/service/analytics'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { Button } from 'web/components/button'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function AddFundsPage() {
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<1000 | 2500 | 10000>(
    2500
  )

  useTracking('view add funds')

  return (
    <Page>
      <SEO
        title="Get Mana"
        description="Buy mana to trade in your favorite markets on Manifold"
        url="/add-funds"
      />

      <Col className="items-center">
        <Col className="h-full rounded bg-white p-4 py-8 sm:p-8 sm:shadow-md">
          <Title className="!mt-0" text="Get Mana" />
          <img
            className="mb-6 block self-center"
            src="/welcome/manipurple.png"
            width={200}
            height={200}
          />

          <div className="mb-6 text-gray-500">
            Buy mana (M$) to trade in your favorite markets. <br />{' '}
            <i>Not redeemable for cash.</i>
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
            <Button
              type="submit"
              color="gradient"
              size="xl"
              className="w-full"
              onClick={trackCallback('checkout', { amount: amountSelected })}
            >
              Checkout
            </Button>
          </form>
        </Col>
      </Col>
    </Page>
  )
}

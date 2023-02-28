import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'
import { trackCallback } from 'web/lib/service/analytics'
import { Button } from 'web/components/buttons/button'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { formatMoney } from 'common/util/format'
import {
  FundsSelector,
  OtherWaysToGetMana,
} from 'web/components/add-funds-modal'
import { ENV_CONFIG } from 'common/envs/constants'

export const WEB_PRICES = {
  [formatMoney(1000)]: 1000,
  [formatMoney(2500)]: 2500,
  [formatMoney(10000)]: 10000,
}
export const IOS_PRICES = {
  [formatMoney(1000)]: 1199,
  [formatMoney(2500)]: 2999,
  [formatMoney(10000)]: 11999,
}

export default function AddFundsPage() {
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<number>(2500)

  useRedirectIfSignedOut()
  useTracking('view add funds')

  return (
    <Page>
      <SEO
        title="Get Mana"
        description="Buy mana to trade in your favorite markets on Manifold"
        url="/add-funds"
      />

      <Col className="bg-canvas-0 mx-auto max-w-[700px] rounded p-4 py-8 sm:p-8 sm:shadow-md">
        <Title>Get Mana</Title>

        <div className="mb-6">
          Buy mana ({ENV_CONFIG.moneyMoniker}) to trade in your favorite
          markets.
          <div className="italic">Not redeemable for cash.</div>
        </div>

        <div className="text-ink-500 mb-2 text-sm">Amount</div>
        <FundsSelector
          fundAmounts={WEB_PRICES}
          selected={amountSelected}
          onSelect={setAmountSelected}
        />

        <div className="mt-6">
          <div className="text-ink-500 mb-1 text-sm">Price USD</div>
          <div className="text-xl">${Math.round(amountSelected / 100)}.00</div>
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

        <div className="mb-4 mt-12">
          Short on cash? Here are some other ways to get mana:
        </div>
        <OtherWaysToGetMana />
      </Col>
    </Page>
  )
}

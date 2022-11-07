import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { FundsSelector } from 'web/components/bet/yes-no-selector'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'
import { trackCallback } from 'web/lib/service/analytics'
import { Button } from 'web/components/buttons/button'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { getNativePlatform } from 'web/lib/native/is-native'
import {
  AddFundsIOS,
  OtherWaysToGetMana,
} from 'web/components/native/add-funds-ios'

export default function AddFundsPage() {
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<1000 | 2500 | 10000>(
    2500
  )

  useRedirectIfSignedOut()
  useTracking('view add funds')

  const { isNative, platform } = getNativePlatform() ?? {}
  if (isNative && platform === 'ios') {
    return <AddFundsIOS />
  }

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

          <div className="mb-6">
            Buy mana (M$) to trade in your favorite markets.
            <div className="italic">Not redeemable for cash.</div>
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

          <div className="mb-4 mt-12">
            Short on cash? Here are some other ways to get mana:
          </div>
          <OtherWaysToGetMana />
        </Col>
      </Col>
    </Page>
  )
}

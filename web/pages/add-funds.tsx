import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { formatMoney } from 'common/util/format'
import { BuyManaTab } from 'web/components/add-funds-modal'

export const WEB_PRICES = {
  10000: 1399,
  25000: 2999,
  100000: 10999,
  1000000: 100000,
}
export type WebPriceKeys = keyof typeof WEB_PRICES

export const IOS_PRICES = {
  10000: 1499,
  25000: 3599,
  100000: 14299,
}

export default function AddFundsPage() {
  useRedirectIfSignedOut()

  return (
    <Page trackPageView={'add funds'}>
      <SEO
        title="Get mana"
        description="Buy mana to trade in your favorite questions on Manifold"
        url="/add-funds"
      />

      <Col className="bg-canvas-0 mx-auto max-w-[700px] rounded p-4 py-8 sm:p-8 sm:shadow-md">
        <Title>Get Mana</Title>

        <BuyManaTab onClose={() => {}} />
      </Col>
    </Page>
  )
}

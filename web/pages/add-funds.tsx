import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { formatMoney } from 'common/util/format'
import { BuyManaTab } from 'web/components/add-funds-modal'

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
  useRedirectIfSignedOut()
  useTracking('view add funds')

  return (
    <Page>
      <SEO
        title="Get mana"
        description="Buy mana to trade in your favorite markets on Manifold"
        url="/add-funds"
      />

      <Col className="bg-canvas-0 mx-auto max-w-[700px] rounded p-4 py-8 sm:p-8 sm:shadow-md">
        <Title>Get Mana</Title>

        <BuyManaTab onClose={() => {}} />
      </Col>
    </Page>
  )
}

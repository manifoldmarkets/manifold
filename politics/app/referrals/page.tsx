import { REFERRAL_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { PoliticsPage } from 'politics/components/politics-page'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { ReferralCopy } from 'politics/components/referral-copy'
import { Suspense } from 'react'

export default function ReferralsPage() {
  return (
    <PoliticsPage trackPageView={'politics referrals'} className="items-center">
      <SEO
        title="Earn mana by referring friends!"
        description={`Invite someone to join Manifold Politics and get ${formatMoney(
          REFERRAL_AMOUNT
        )} if they sign up!`}
      />

      <Col className="bg-canvas-0 rounded-lg p-4 sm:p-8">
        <Title>Earn mana by referring friends!</Title>

        <div className="mb-2">
          Invite someone to join manifold politics and get{' '}
          {formatMoney(REFERRAL_AMOUNT)} if they sign up!
        </div>
        <Suspense fallback={<div>Loading...</div>}>
          <ReferralCopy className={'gap-4'} />
        </Suspense>
      </Col>
    </PoliticsPage>
  )
}

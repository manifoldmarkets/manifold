import { REFERRAL_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { PoliticsPage } from 'politics/components/politics-page'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { ReferralCopy } from 'politics/components/referral-copy'

export default function ReferralsPage() {
  return (
    <PoliticsPage trackPageView={'politics referrals'} className="items-center">
      <Col className="bg-canvas-0 rounded-lg p-4 sm:p-8">
        <Title>Earn mana by referring friends!</Title>

        <div className="mb-2">
          Invite someone to join manifold politics and get{' '}
          {formatMoney(REFERRAL_AMOUNT)} if they sign up!
        </div>
        <ReferralCopy className={'gap-4'} />
      </Col>
    </PoliticsPage>
  )
}

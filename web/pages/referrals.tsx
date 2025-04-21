import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { InfoBox } from 'web/components/widgets/info-box'
import { QRCode } from 'web/components/widgets/qr-code'
import { REFERRAL_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import clsx from 'clsx'
import { TokenNumber } from 'web/components/widgets/token-number'
import { referralQuery } from 'common/util/share'
export const getServerSideProps = redirectIfLoggedOut('/')

export default function ReferralsPage() {
  const user = useUser()

  const url = `https://${ENV_CONFIG.domain}${referralQuery(
    user?.username ?? ''
  )}`

  return (
    <Page trackPageView={'referrals'}>
      <SEO
        title="Refer a friend"
        description={`Invite new users to Manifold and get ${formatMoney(
          REFERRAL_AMOUNT
        )} if they sign up and place a trade!`}
        url="/referrals"
      />

      <Col className="items-center">
        <Col className="bg-canvas-0 h-full rounded p-4 py-8 sm:p-8 sm:shadow-md">
          <Title>Refer a friend</Title>
          <img
            className="mb-6 block -scale-x-100 self-center"
            src="/logo-flapping-with-money.gif"
            width={200}
            height={200}
            alt=""
          />

          <div className={'mb-4'}>
            Invite new users to Manifold and get{' '}
            <TokenNumber
              coinType={'MANA'}
              amount={REFERRAL_AMOUNT}
              className={clsx('font-bold')}
              isInline
            />{' '}
            if they sign up and place a trade!
          </div>

          <CopyLinkRow url={url} eventTrackingName="copy referral link" />

          <QRCode url={url} className="mt-4 self-center" />

          <InfoBox
            title="FYI"
            className="mt-4"
            text="You can also earn the referral bonus using the share link to any question or group!"
          />
        </Col>
      </Col>
    </Page>
  )
}

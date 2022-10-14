import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/page'
import { useTracking } from 'web/hooks/use-tracking'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { InfoBox } from 'web/components/info-box'
import { QRCode } from 'web/components/qr-code'
import { REFERRAL_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function ReferralsPage() {
  const user = useUser()

  useTracking('view referrals')

  const url = `https://${ENV_CONFIG.domain}?referrer=${user?.username}`

  return (
    <Page>
      <SEO
        title="Refer a friend"
        description={`Invite new users to Manifold and get ${formatMoney(
          REFERRAL_AMOUNT
        )} if they
            sign up!`}
        url="/referrals"
      />

      <Col className="items-center">
        <Col className="h-full rounded bg-white p-4 py-8 sm:p-8 sm:shadow-md">
          <Title className="!mt-0" text="Refer a friend" />
          <img
            className="mb-6 block -scale-x-100 self-center"
            src="/logo-flapping-with-money.gif"
            width={200}
            height={200}
          />

          <div className={'mb-4'}>
            Invite new users to Manifold and get {formatMoney(REFERRAL_AMOUNT)}{' '}
            if they sign up!
          </div>

          <CopyLinkButton
            url={url}
            tracking="copy referral link"
            buttonClassName="rounded-l-none"
            toastClassName={'-left-28 mt-1'}
          />

          <QRCode url={url} className="mt-4 self-center" />

          <InfoBox
            title="FYI"
            className="mt-4 max-w-md"
            text="You can also earn the referral bonus using the share link to any market or group!"
          />
        </Col>
      </Col>
    </Page>
  )
}

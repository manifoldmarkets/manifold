import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { QRCode } from 'web/components/widgets/qr-code'
import { REFERRAL_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { TokenNumber } from 'web/components/widgets/token-number'
import { referralQuery } from 'common/util/share'
import { useEffect, useState } from 'react'
import { getReferrals } from 'web/lib/supabase/referrals'
import { DisplayUser } from 'common/api/user-types'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function ReferralsPage() {
  const user = useUser()
  const [referredUsers, setReferredUsers] = useState<
    DisplayUser[] | undefined
  >()

  useEffect(() => {
    if (user) {
      getReferrals(user.id).then(setReferredUsers)
    }
  }, [user?.id])

  const url = `https://${ENV_CONFIG.domain}${referralQuery(
    user?.username ?? ''
  )}`

  const referralCount = referredUsers?.length ?? 0

  return (
    <Page trackPageView={'referrals'} className="p-3">
      <SEO
        title="Refer a friend"
        description={`Invite new users to Manifold and get ${formatMoney(
          REFERRAL_AMOUNT
        )} if they sign up and place a trade!`}
        url="/referrals"
      />

      <Col className="mx-auto w-full max-w-xl gap-6">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f46e5]/70 via-[#5b4ee6]/50 to-[#6366f1]/40 p-6 text-white shadow-lg sm:p-8">
          {/* Background decorations */}
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />

          <div className="relative">
            <Row className="mb-4 items-center gap-3">
              <h1 className="text-2xl font-bold sm:text-3xl">Refer a Friend</h1>
            </Row>

            <p className="mb-6 max-w-md text-white/90">
              Invite friends to join Manifold and earn{' '}
              <span className="font-semibold text-white">
                {formatMoney(REFERRAL_AMOUNT)}
              </span>{' '}
              for each friend who signs up and places their first trade.
            </p>

            {/* Stats row */}
            <Row className="flex-wrap gap-4">
              <div className="bg-white/15 rounded-xl px-4 py-3 backdrop-blur-sm">
                <div className="text-2xl font-bold">{referralCount}</div>
                <div className="text-sm text-white/80">
                  {referralCount === 1 ? 'Friend referred' : 'Friends referred'}
                </div>
              </div>
              <div className="bg-white/15 rounded-xl px-4 py-3 backdrop-blur-sm">
                <div className="text-2xl font-bold">
                  {formatMoney(referralCount * REFERRAL_AMOUNT)}
                </div>
                <div className="text-sm text-white/80">Total earned</div>
              </div>
            </Row>
          </div>
        </div>

        {/* Share Section */}
        <div className="bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-xl border p-5 shadow-sm sm:p-6">
          <Row className="mb-4 items-center gap-2">
            <h2 className="text-lg font-semibold">Share your link</h2>
          </Row>

          <p className="text-ink-600 mb-4 text-sm">
            Copy your unique referral link or scan the QR code to share with
            friends. Once they place their first trade, you both get rewarded!
          </p>

          <CopyLinkRow
            url={url}
            eventTrackingName="copy referral link"
            linkBoxClassName="w-full"
          />

          {/* QR Code Card */}
          <div className="mt-5 flex justify-center">
            <div className="bg-canvas-50 rounded-xl p-4">
              <QRCode url={url} width={180} height={180} className="rounded" />
            </div>
          </div>
        </div>

        {/* Your Referrals Section */}
        <div className="bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-xl border p-5 shadow-sm sm:p-6">
          <Row className="mb-4 items-center justify-between">
            <Row className="items-center gap-2">
              <UserAddIcon className="text-primary-600 h-5 w-5" />
              <h2 className="text-lg font-semibold">Your referrals</h2>
            </Row>
            {referredUsers && referredUsers.length > 0 && (
              <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 rounded-full px-2.5 py-0.5 text-sm font-medium">
                {referredUsers.length}
              </span>
            )}
          </Row>

          {referredUsers === undefined ? (
            <Col className="items-center justify-center py-8">
              <LoadingIndicator />
            </Col>
          ) : referredUsers.length === 0 ? (
            <EmptyReferralsState />
          ) : (
            <ReferralsList users={referredUsers} />
          )}
        </div>
      </Col>
    </Page>
  )
}

function HowItWorksStep(props: {
  number: number
  title: string
  description: string
}) {
  const { number, title, description } = props
  return (
    <Row className="gap-4">
      <div className="bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold">
        {number}
      </div>
      <div className="pt-0.5">
        <h3 className="font-medium">{title}</h3>
        <p className="text-ink-600 mt-0.5 text-sm">{description}</p>
      </div>
    </Row>
  )
}

function EmptyReferralsState() {
  return (
    <Col className="items-center justify-center py-8 text-center">
      <div className="bg-ink-100 dark:bg-ink-800 mb-3 rounded-full p-3">
        <UserAddIcon className="text-ink-400 h-6 w-6" />
      </div>
      <span className="text-ink-600 font-medium">No referrals yet</span>
      <span className="text-ink-500 mt-1 max-w-xs text-sm">
        Share your link above to start inviting friends and earning rewards!
      </span>
    </Col>
  )
}

function ReferralsList(props: { users: DisplayUser[] }) {
  const { users } = props
  return (
    <Col className="divide-ink-100 dark:divide-ink-300 -mx-2 max-h-64 divide-y overflow-y-auto">
      {users.map((user) => (
        <Row
          key={user.id}
          className="hover:bg-canvas-50 items-center gap-3 rounded-lg px-2 py-3 transition-colors"
        >
          <Avatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            size="sm"
          />
          <Col className="min-w-0 flex-1">
            <UserLink user={user} className="font-medium" />
            <span className="text-ink-500 text-xs">@{user.username}</span>
          </Col>
          <div className="text-ink-500 flex-shrink-0 text-xs">
            <TokenNumber
              coinType="MANA"
              amount={REFERRAL_AMOUNT}
              className="text-teal-600"
            />
          </div>
        </Row>
      ))}
    </Col>
  )
}

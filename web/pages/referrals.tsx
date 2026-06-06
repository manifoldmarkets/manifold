import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { QRCode } from 'web/components/widgets/qr-code'
import {
  REFERRAL_AMOUNT,
  REFERRAL_BET_BONUS,
  REFERRAL_VERIFY_BONUS,
} from 'common/economy'
import { formatMoney } from 'common/util/format'
import { TokenNumber } from 'web/components/widgets/token-number'
import { referralQuery } from 'common/util/share'
import {
  GiftIcon,
  ShareIcon,
  UserAddIcon,
  SparklesIcon,
  LightBulbIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/outline'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getReferrals } from 'web/lib/supabase/referrals'
import { DisplayUser } from 'common/api/user-types'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Tooltip } from 'web/components/widgets/tooltip'
import { getEffectiveTier } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

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

  const { data: earnings } = useAPIGetter(
    'get-referral-earnings',
    user ? {} : undefined
  )

  const url = `https://${ENV_CONFIG.domain}${referralQuery(
    user?.username ?? ''
  )}`

  const referralCount = referredUsers?.length ?? 0
  const totalEarned = earnings?.total ?? 0
  const earnedByUserId: Record<
    string,
    {
      amount: number
      maxMultiplier: number
      bonusTypes: ('first_bet' | 'verify' | 'legacy')[]
    }
  > = earnings?.byReferredUserId ?? {}

  // Unverified users earn a reduced 0.2x referral bonus (not zero). Surface a
  // banner so they know their earnings are reduced and how to unlock the full
  // amount (verify or subscribe).
  const tier = user ? getEffectiveTier(user) : 'verified'
  const referralsReduced = tier === 'unverified'
  const isDeniedKyc = user?.bonusEligibility === 'ineligible'

  return (
    <Page trackPageView={'referrals'} className="p-3">
      <SEO
        title="Refer a friend"
        description={`Invite new users to Manifold and earn up to ${formatMoney(
          REFERRAL_AMOUNT
        )} per friend who signs up, places a trade, and verifies their identity.`}
        url="/referrals"
      />

      <Col className="mx-auto w-full max-w-xl gap-6">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6 text-white shadow-lg sm:p-8">
          {/* Background decorations */}
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />

          <div className="relative">
            <Row className="mb-4 items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur-sm">
                <GiftIcon className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">Refer a Friend</h1>
            </Row>

            <p className="mb-6 max-w-md text-white/90">
              Invite friends to join Manifold and earn{' '}
              <span className="font-semibold text-white">
                {formatMoney(REFERRAL_BET_BONUS)}
              </span>{' '}
              when they place their first trade, plus{' '}
              <span className="font-semibold text-white">
                {formatMoney(REFERRAL_VERIFY_BONUS)}
              </span>{' '}
              when they verify their identity.
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
                  {formatMoney(totalEarned)}
                </div>
                <div className="text-sm text-white/80">Total earned</div>
              </div>
            </Row>
          </div>
        </div>

        {referralsReduced && <ReferralsReducedBanner isDenied={isDeniedKyc} />}

        {/* Share Section */}
        <div className="bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-xl border p-5 shadow-sm sm:p-6">
          <Row className="mb-4 items-center gap-2">
            <ShareIcon className="text-primary-600 h-5 w-5" />
            <h2 className="text-lg font-semibold">Share your link</h2>
          </Row>

          <p className="text-ink-600 mb-4 text-sm">
            Copy your unique referral link or scan the QR code to share with
            friends.
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

        {/* How It Works Section */}
        <div className="bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-xl border p-5 shadow-sm sm:p-6">
          <Row className="mb-5 items-center gap-2">
            <SparklesIcon className="text-primary-600 h-5 w-5" />
            <h2 className="text-lg font-semibold">How it works</h2>
          </Row>

          <div className="space-y-4">
            <HowItWorksStep
              number={1}
              title="Share your link"
              description="Send your unique referral link to friends via social media, email, or messaging."
            />
            <HowItWorksStep
              number={2}
              title="Friend signs up"
              description="Your friend creates a Manifold account using your link."
            />
            <HowItWorksStep
              number={3}
              title="They place a trade"
              description={`Earn ${formatMoney(
                REFERRAL_BET_BONUS
              )} the moment they make their first prediction.`}
            />
            <HowItWorksStep
              number={4}
              title="They verify their identity"
              description={`Earn another ${formatMoney(
                REFERRAL_VERIFY_BONUS
              )} when they complete identity verification.`}
            />
          </div>
        </div>

        {/* Pro Tip */}
        <div className="bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-xl border p-4">
          <Row className="items-start gap-3">
            <div className="bg-ink-100 dark:bg-ink-800 rounded-lg p-2">
              <LightBulbIcon className="text-primary-600 h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium">Pro tip</h3>
              <p className="text-ink-600 mt-1 text-sm">
                You can also earn the referral bonus by sharing a link to any
                question or group! Your referral code is automatically included.
              </p>
            </div>
          </Row>
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
            <ReferralsList
              users={referredUsers}
              earnedByUserId={earnedByUserId}
            />
          )}
        </div>
      </Col>
    </Page>
  )
}

function ReferralsReducedBanner({ isDenied }: { isDenied: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    setLoading(true)
    setError(null)
    try {
      track('referrals page: verify clicked')
      const response = await api('create-idenfy-session', {})
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setError('Failed to start verification. Please try again.')
      setLoading(false)
    }
  }

  // Failed-KYC users can't re-verify through this surface; skip the verify CTA.
  if (isDenied) {
    return (
      <div className="border-scarlet-200 bg-scarlet-50 dark:border-scarlet-800 dark:bg-scarlet-950/30 rounded-xl border p-4">
        <Row className="items-start gap-3">
          <ShieldExclamationIcon className="text-scarlet-500 mt-0.5 h-5 w-5 shrink-0" />
          <Col className="gap-1">
            <span className="text-scarlet-800 dark:text-scarlet-200 font-semibold">
              Your referral bonuses are reduced
            </span>
            <span className="text-scarlet-700 dark:text-scarlet-300 text-sm">
              Identity verification was unsuccessful, so you earn a reduced 0.2x
              referral bonus. Subscribe to{' '}
              <Link href="/membership" className="font-semibold underline">
                Manifold Plus
              </Link>{' '}
              to earn the full amount, or email{' '}
              <a
                href="mailto:info@manifold.markets"
                className="font-semibold underline"
              >
                info@manifold.markets
              </a>{' '}
              if you think this is a mistake.
            </span>
          </Col>
        </Row>
      </div>
    )
  }

  return (
    <div className="border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/30 rounded-xl border p-4">
      <Row className="items-start gap-3">
        <ShieldExclamationIcon className="text-primary-500 mt-0.5 h-5 w-5 shrink-0" />
        <Col className="flex-1 gap-2">
          <Col className="gap-1">
            <span className="text-primary-800 dark:text-primary-200 font-semibold">
              Your referral bonuses are reduced
            </span>
            <span className="text-primary-700 dark:text-primary-300 text-sm">
              You earn a reduced 0.2x referral bonus right now. Verify your
              identity or subscribe to{' '}
              <Link href="/membership" className="font-semibold underline">
                Manifold Plus
              </Link>{' '}
              to earn the full {formatMoney(REFERRAL_BET_BONUS)} +{' '}
              {formatMoney(REFERRAL_VERIFY_BONUS)} per friend.
            </span>
          </Col>
          <Row className="gap-2">
            <Button
              size="sm"
              onClick={handleVerify}
              loading={loading}
              disabled={loading}
            >
              Verify identity
            </Button>
            <Link
              href="/membership"
              onClick={() => track('referrals page: subscribe clicked')}
            >
              <Button size="sm" color="gray-outline">
                See membership
              </Button>
            </Link>
          </Row>
          {error && <span className="text-scarlet-500 text-xs">{error}</span>}
        </Col>
      </Row>
    </div>
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

function ReferralsList(props: {
  users: DisplayUser[]
  earnedByUserId: Record<
    string,
    {
      amount: number
      maxMultiplier: number
      bonusTypes: ('first_bet' | 'verify' | 'legacy')[]
    }
  >
}) {
  const { users, earnedByUserId } = props
  return (
    <Col className="divide-ink-100 dark:divide-ink-300 -mx-2 max-h-64 divide-y overflow-y-auto">
      {users.map((user) => {
        const entry = earnedByUserId[user.id]
        const amount = entry?.amount ?? 0
        const multiplier = entry?.maxMultiplier ?? 1
        const bonusTypes = entry?.bonusTypes ?? []
        // Verify portion is still claimable if we've ONLY paid the first-bet
        // bonus and never a verify or legacy txn for this referred user.
        const verifyPending =
          amount > 0 &&
          bonusTypes.includes('first_bet') &&
          !bonusTypes.includes('verify') &&
          !bonusTypes.includes('legacy')
        return (
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
            <Row className="flex-shrink-0 items-center justify-end gap-1.5 text-xs">
              {verifyPending && (
                <Tooltip
                  text={`First-trade bonus paid. They haven't verified their identity yet — you'll earn ${formatMoney(
                    REFERRAL_VERIFY_BONUS
                  )} more when they do.`}
                >
                  <span className="cursor-default rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    Verify pending
                  </span>
                </Tooltip>
              )}
              {amount > 0 && multiplier > 1 && (
                <Tooltip
                  text={`Boosted by your supporter membership at payout time (${multiplier}× referral multiplier).`}
                >
                  <span className="cursor-default rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {multiplier}×
                  </span>
                </Tooltip>
              )}
              {amount === 0 && (
                <Tooltip text="They haven't placed a trade or verified their identity yet — no referral bonus has been paid for them.">
                  <span className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400 cursor-default rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                    ?
                  </span>
                </Tooltip>
              )}
              <div className="w-20">
                {amount > 0 ? (
                  <div className="text-right">
                    <TokenNumber
                      coinType="MANA"
                      amount={amount}
                      className="text-teal-600"
                    />
                  </div>
                ) : (
                  <span className="text-ink-400 italic">Pending</span>
                )}
              </div>
            </Row>
          </Row>
        )
      })}
    </Col>
  )
}

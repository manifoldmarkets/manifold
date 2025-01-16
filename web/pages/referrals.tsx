import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import {
  REFERRAL_AMOUNT,
  REFERRAL_AMOUNT_CASH,
  REFERRAL_MIN_PURCHASE_DOLLARS,
} from 'common/economy'
import { formatMoney } from 'common/util/format'
import { TokenNumber } from 'web/components/widgets/token-number'
import clsx from 'clsx'
import { getReferralCodeFromUser } from 'common/util/share'
import { Button, buttonClass } from 'web/components/buttons/button'
import { copyToClipboard } from 'web/lib/util/copy'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ENV_CONFIG } from 'common/envs/constants'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function ReferralsPage() {
  const user = useUser()
  const isSweepstakesVerified = user?.sweepstakesVerified

  const code = getReferralCodeFromUser(user?.id)
  return (
    <Page trackPageView={'referrals'}>
      <SEO
        title="Refer a friend"
        description={`Invite new users to Manifold and get ${formatMoney(
          REFERRAL_AMOUNT
        )} if they sign up and place a trade!`}
        url="/referrals"
      />

      <Col className="mx-auto max-w-2xl items-center">
        <Col className="bg-canvas-0 rounded-lg p-8 shadow-lg">
          <h1 className="mb-6 text-center text-3xl font-bold">
            Refer a Friend
          </h1>

          <img
            className="mx-auto mb-8 block"
            src="/logo-flapping-with-money.gif"
            width={200}
            height={200}
            alt="Animated logo"
          />

          {isSweepstakesVerified ? (
            <div className="mb-8 text-center">
              <p className="mb-4 text-xl">
                Invite friends to Manifold and you'll both get
              </p>
              <div className="flex items-center justify-center gap-2 text-2xl font-bold">
                <TokenNumber
                  coinType={'CASH'}
                  amount={REFERRAL_AMOUNT_CASH}
                  isInline
                />
                <span>+</span>
                <TokenNumber
                  coinType={'MANA'}
                  amount={REFERRAL_AMOUNT}
                  isInline
                />
              </div>
              <p className="mt-2">
                when they register and purchase ${REFERRAL_MIN_PURCHASE_DOLLARS}{' '}
                of mana!
              </p>
            </div>
          ) : (
            <div className="mb-8 text-center">
              <p className="mb-4 text-xl">
                Invite friends to Manifold and earn
              </p>
              <div className="text-2xl font-bold">
                <TokenNumber amount={REFERRAL_AMOUNT} isInline />
              </div>
              <p className="mt-2">
                when they register and purchase ${REFERRAL_MIN_PURCHASE_DOLLARS}{' '}
                of mana!
              </p>
            </div>
          )}

          <div className="bg-primary-100 mb-8 rounded-lg p-6">
            <p className="mb-2 text-center text-lg">Your Referral Code</p>
            <div className="mb-4 text-center text-4xl font-bold">{code}</div>
            <Button
              onClick={() => {
                copyToClipboard(code)
                toast.success('Referral code copied to clipboard')
              }}
              size="xl"
              className="w-full"
            >
              Copy referral code
            </Button>
          </div>

          {!isSweepstakesVerified && (
            <Link
              href={`https://${ENV_CONFIG.domain}/gidx/register`}
              className={clsx(buttonClass('xl', 'gold'), 'w-full')}
            >
              <span>Register to earn +</span>
              <TokenNumber
                coinType={'CASH'}
                amount={REFERRAL_AMOUNT_CASH}
                className="mx-1 font-bold"
                isInline
              />
              <span>sweepcash for each referral</span>
            </Link>
          )}
        </Col>
      </Col>
    </Page>
  )
}

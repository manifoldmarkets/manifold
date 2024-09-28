import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { REFERRAL_AMOUNT, REFERRAL_AMOUNT_CASH } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { CoinNumber } from 'web/components/widgets/coin-number'
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

      <Col className="items-center max-w-2xl mx-auto">
        <Col className="bg-canvas-0 rounded-lg p-8 shadow-lg">
          <h1 className="text-3xl font-bold mb-6 text-center">Refer a Friend</h1>
          
          <img
            className="mb-8 block mx-auto"
            src="/logo-flapping-with-money.gif"
            width={200}
            height={200}
            alt="Animated logo"
          />

          {isSweepstakesVerified ? (
            <div className="text-center mb-8">
              <p className="text-xl mb-4">
                Invite friends to Manifold and get
              </p>
              <div className="flex justify-center items-center gap-2 text-2xl font-bold">
                <CoinNumber
                  coinType={'CASH'}
                  amount={REFERRAL_AMOUNT_CASH}
                  isInline
                />
                <span>+</span>
                <CoinNumber
                  coinType={'MANA'}
                  amount={REFERRAL_AMOUNT}
                  isInline
                />
              </div>
              <p className="mt-2">when they sign up & verify for sweepstakes!</p>
            </div>
          ) : (
            <div className="text-center mb-8">
              <p className="text-xl mb-4">
                Invite friends to Manifold and earn
              </p>
              <div className="text-2xl font-bold">
                <CoinNumber
                  amount={REFERRAL_AMOUNT}
                  isInline
                />
              </div>
              <p className="mt-2">when they sign up and use your referral code!</p>
            </div>
          )}

          <div className="bg-primary-100 rounded-lg p-6 mb-8">
            <p className="text-center text-lg mb-2">Your Referral Code</p>
            <div className="text-4xl font-bold text-center mb-4">{code}</div>
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
              <CoinNumber
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

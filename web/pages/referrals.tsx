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

      <Col className="items-center">
        <Col className="bg-canvas-0 h-full rounded p-4 py-8 sm:p-8 sm:shadow-md">
          {isSweepstakesVerified ? (
            <>
              <span className="text-2xl">Get free sweepcash</span>
              <img
                className="mb-6 block -scale-x-100 self-center"
                src="/logo-flapping-with-money.gif"
                width={200}
                height={200}
                alt=""
              />

              <div className={'mb-4'}>
                Invite friends to Manifold and get{' '}
                <CoinNumber
                  coinType={'CASH'}
                  amount={REFERRAL_AMOUNT_CASH}
                  className={clsx('font-bold')}
                  isInline
                />{' '}
                +{' '}
                <CoinNumber
                  coinType={'MANA'}
                  amount={REFERRAL_AMOUNT}
                  className={clsx(' mx-1 font-bold')}
                  isInline
                />
                when they sign up & verify for sweepstakes!
              </div>
              <Col className="w-full items-center justify-center gap-4">
                <span className=" px-4 py-2 text-4xl">{code}</span>
                <Button
                  onClick={() => {
                    copyToClipboard(code)
                    toast.success('Referral code copied to clipboard')
                  }}
                  size="xl"
                >
                  Copy referral code
                </Button>
              </Col>
            </>
          ) : (
            <>
              <span className="text-2xl">Earn free mana </span>
              <img
                className="mb-6 block -scale-x-100 self-center"
                src="/logo-flapping-with-money.gif"
                width={200}
                height={200}
                alt=""
              />
              <div className={'mb-4'}>
                Invite friends to Manifold and earn{' '}
                <CoinNumber
                  amount={REFERRAL_AMOUNT}
                  className={clsx('font-bold')}
                  isInline
                />{' '}
                when they sign up and use your referral code!
              </div>
              <Col className="w-full items-center justify-center gap-4">
                <span className=" px-4 py-2 text-4xl">{code}</span>
                <Button
                  onClick={() => {
                    copyToClipboard(code)
                    toast.success('Referral code copied to clipboard')
                  }}
                  size="xl"
                >
                  Copy referral code
                </Button>
                <Link
                  href={`https://${ENV_CONFIG.domain}/gidx/register`}
                  className={buttonClass('xl', 'gold')}
                >
                  Register to earn +
                  <CoinNumber
                    coinType={'CASH'}
                    amount={REFERRAL_AMOUNT_CASH}
                    className={clsx('mx-1 font-bold')}
                    isInline
                  />
                  sweepcash for each referral
                </Link>
              </Col>
            </>
          )}
        </Col>
      </Col>
    </Page>
  )
}

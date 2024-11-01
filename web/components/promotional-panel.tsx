import { Col } from 'web/components/layout/col'

import Image from 'next/image'
import { formatMoneyUSD } from 'common/util/format'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { Row } from 'web/components/layout/row'
import { Button, buttonClass } from 'web/components/buttons/button'
import clsx from 'clsx'
import Link from 'next/link'
import SquiggleVertical from 'web/lib/icons/squiggle-vertical.svg'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { withTracking } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { SweepiesFlatCoin } from 'web/public/custom-components/sweepiesFlatCoin'

export function PromotionalPanel(props: {
  darkModeImg: string
  lightModeImg: string
  header: React.ReactNode
  description?: React.ReactNode
  loginTrackingText: string
}) {
  const user = useUser()
  const { darkModeImg, lightModeImg, header, description, loginTrackingText } =
    props
  const isMobile = useIsMobile()
  return (
    <div
      className={`mx-1 mb-6 flex select-none flex-col overflow-hidden rounded-lg bg-indigo-700 sm:mx-2 sm:flex-row`}
    >
      <Col className={` bg-indigo-700 px-8 py-6 sm:w-[30rem] sm:bg-indigo-300`}>
        <Image
          className="mx-auto my-auto"
          src={isMobile ? darkModeImg : lightModeImg}
          alt="Promotional panel logo"
          height={256}
          width={256}
        />
      </Col>

      <div className={`mx-8 h-[1px] bg-indigo-300 sm:hidden`} />
      <Col className="relative w-full items-center px-8 py-6 text-white sm:px-16">
        {!isMobile && (
          <div className="absolute -left-0.5 bottom-0 z-20 h-full">
            <SquiggleVertical className={clsx(`h-full text-indigo-300`)} />
          </div>
        )}

        <div className="text-2xl">{header}</div>
        <Col className="w-full items-center text-lg text-indigo-300">
          <div className="mx-auto mt-2">{description}</div>
          <Row
            className={`md::text-4xl relative mx-auto mt-4 items-center gap-2 rounded-xl border border-indigo-300 p-5 text-2xl `}
          >
            <CoinNumber
              amount={5000}
              // isInline
              numberType="short"
              className=" font-bold text-white"
            />
            <div className="text-xl">+</div>
            <CoinNumber
              amount={40}
              // isInline
              coinType={'sweepies'}
              className="font-bold text-white"
            />{' '}
            <div
              className={`absolute bottom-[-14px]  left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-indigo-300 px-3 text-lg text-indigo-700`}
            >
              for only <b>{formatMoneyUSD(20)}</b>
            </div>
          </Row>
          <div className="mt-5">
            <CoinNumber
              amount={1}
              coinType={'sweepies'}
              isInline
              numberType="short"
            />{' '}
            → {formatMoneyUSD(1)} USD
          </div>

          <div className="group relative z-30 mt-8">
            {!user ? (
              <>
                <Button
                  className={clsx(
                    buttonClass('2xl', 'gradient-pink'),
                    'absolute -left-1.5 bottom-1.5 z-10 mt-8 transition-all ease-in-out focus:-left-0.5 focus:bottom-0.5 group-hover:-left-2 group-hover:bottom-2 focus:group-hover:-left-0.5 focus:group-hover:bottom-0.5'
                  )}
                  onClick={withTracking(firebaseLogin, loginTrackingText)}
                  color="gradient-pink"
                >
                  Sign up!
                </Button>
                <div
                  className={clsx(
                    `text-ink-900 rounded-md bg-teal-300 dark:bg-teal-700`,
                    'px-6 py-3 text-xl font-semibold'
                  )}
                >
                  Sign up!
                </div>
              </>
            ) : (
              <>
                <Link
                  className={clsx(
                    buttonClass('2xl', 'gradient-pink'),
                    'absolute -left-1.5 bottom-1.5 z-10 mt-8 transition-all ease-in-out focus:-left-0.5 focus:bottom-0.5 group-hover:-left-2 group-hover:bottom-2 focus:group-hover:-left-0.5 focus:group-hover:bottom-0.5'
                  )}
                  href="/gidx/register"
                  color="gradient-pink"
                >
                  Verify!
                </Link>
                <div
                  className={clsx(
                    `text-ink-900 rounded-md bg-teal-300 dark:bg-teal-700`,
                    'px-6 py-3 text-xl font-semibold'
                  )}
                >
                  Verify!
                </div>
              </>
            )}
          </div>
          {user && (
            <div className="mx-auto mt-2 text-center text-green-300">
              <div>Successfully signed up!</div>
              <div> Please verify for welcome offer.</div>
            </div>
          )}
        </Col>
      </Col>
    </div>
  )
}

PromotionalPanel.defaultProps = {
  description: (
    <>
      Register today to get your free sweepcash <SweepiesFlatCoin /> and unlock
      a limited time offer in store!
    </>
  ),
}

import clsx from 'clsx'
import { MARKET_VISIT_BONUS_TOTAL, STARTING_BALANCE } from 'common/economy'
import { SWEEPIES_NAME, TRADE_TERM, TRADING_TERM } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { firebaseLogin } from 'web/lib/firebase/users'
import SquiggleHorizontal from 'web/lib/icons/squiggle-horizontal.svg'
import SquiggleVertical from 'web/lib/icons/squiggle-vertical.svg'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from './layout/row'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export function SweepsExplainer() {
  const isMobile = useIsMobile()

  return (
    <>
      <div
        className={clsx(
          'flex h-64 w-full flex-col overflow-hidden drop-shadow-sm sm:mt-4 sm:h-48 sm:flex-row sm:text-lg '
        )}
      >
        <div
          className={clsx(
            'relative z-30 h-[37%] w-full rounded-t-xl bg-indigo-200 p-4 sm:h-full sm:w-[50%] sm:rounded-l-xl sm:rounded-r-none sm:p-8 '
          )}
        >
          <Row className="h-full w-full items-center gap-4 pt-7 text-black sm:pt-0">
            <ManaCoin className="text-8xl" />
            Compete with your friends by {TRADING_TERM} with play money
          </Row>
        </div>
        <div className="relative h-[63%] w-full rounded-b-xl bg-indigo-700 p-4 align-bottom sm:h-full sm:w-[50%] sm:rounded-l-none sm:rounded-r-xl sm:p-8 sm:pl-16">
          {!isMobile && (
            <div className="absolute -left-0.5 bottom-0 z-20 h-full">
              <SquiggleVertical className={clsx('h-full text-indigo-200')} />
            </div>
          )}
          {isMobile && (
            <div className="absolute -top-0.5 right-0 z-10 w-full items-center">
              <SquiggleHorizontal
                className={clsx('h-16 w-full object-fill text-indigo-200')}
                preserveAspectRatio="none"
              />
            </div>
          )}
          <Row className=" h-full w-full items-end gap-4  text-white sm:items-center">
            Or {TRADE_TERM} with {SWEEPIES_NAME} for a chance to win real
            prizes!
            <SweepiesCoin className="text-8xl" />
          </Row>
        </div>
      </div>
    </>
  )
}

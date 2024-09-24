import clsx from 'clsx'
import { SWEEPIES_NAME, TRADE_TERM, TRADING_TERM } from 'common/envs/constants'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import SquiggleHorizontal from 'web/lib/icons/squiggle-horizontal.svg'
import SquiggleVertical from 'web/lib/icons/squiggle-vertical.svg'
import { Row } from './layout/row'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export function SweepsExplainer() {
  const isMobile = useIsMobile()

  return (
    <>
      <div
        className={clsx(
          'flex h-60 w-full flex-col overflow-hidden text-lg drop-shadow-sm sm:mt-4 sm:h-48 sm:flex-row '
        )}
      >
        <div
          className={clsx(
            'relative z-30 h-[40%] w-full rounded-t-xl bg-indigo-200 p-4 sm:h-full sm:w-[50%] sm:rounded-l-xl sm:rounded-r-none sm:p-8 '
          )}
        >
          <Row className="h-full w-full items-center gap-4 pt-6 font-semibold text-indigo-700 sm:pt-0">
            <ManaCoin className="text-7xl md:text-8xl" />
            <span className="mb-2 sm:mb-0">
              Compete with your friends by {TRADING_TERM} with play money...
            </span>
          </Row>
        </div>
        <div className="relative h-[60%] w-full rounded-b-xl bg-indigo-700 p-4 align-bottom sm:h-full sm:w-[50%] sm:rounded-l-none sm:rounded-r-xl sm:p-8 sm:pl-16">
          {!isMobile && (
            <div className="absolute -left-0.5 bottom-0 z-20 h-full">
              <SquiggleVertical className={clsx('h-full text-indigo-200')} />
            </div>
          )}
          {isMobile && (
            <div className="absolute -top-0.5 right-0 z-10 w-full items-center">
              <SquiggleHorizontal
                className={clsx('h-12 w-full object-fill text-indigo-200')}
                preserveAspectRatio="none"
              />
            </div>
          )}
          <Row className=" h-full w-full items-end gap-4 font-semibold text-white sm:items-center">
            <span className="mb-2 sm:mb-0 sm:text-right">
              Or {TRADE_TERM} with {SWEEPIES_NAME} and win real cash prizes!
            </span>
            <SweepiesCoin className="text-7xl md:text-8xl" />
          </Row>
        </div>
      </div>
    </>
  )
}

export function SweepsInfographic() {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <img src="/sweeps-infographic.svg" alt="Sweepstakes Infographic" className="w-full h-auto" />
    </div>
  )
}

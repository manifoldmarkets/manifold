import type { Dispatch, SetStateAction } from 'react'
import { CheckCircleIcon, MinusIcon, PlusIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import {
  BET_TAP_ADD,
  isStatusAFailure,
  STARTING_BET_AMOUNT,
} from './swipe-helpers'
import { TouchButton } from './touch-button'
import { Col } from '../layout/col'

export function SwipeBetPanel(props: {
  amount: number
  disabled: boolean
  setAmount: Dispatch<SetStateAction<number>>
  onBet: (outcome: 'YES' | 'NO') => void
  betDirection: 'YES' | 'NO' | undefined
  betStatus: 'loading' | 'success' | string | undefined
}) {
  const { amount, setAmount, disabled, onBet, betDirection, betStatus } = props
  const [pressState, setPressState] = useState<string | undefined>(undefined)

  const processPress = () => {
    if (setAmount) {
      if (pressState === 'add') {
        setAmount((a) => Math.min(250, a + BET_TAP_ADD))
      }
      if (pressState === 'sub') {
        setAmount((a) => Math.max(STARTING_BET_AMOUNT, a - BET_TAP_ADD))
      }
    }
  }

  useEffect(() => {
    if (pressState) {
      processPress()
      const interval = setInterval(processPress, 100)
      return () => clearInterval(interval)
    }
  }, [pressState])

  const swipingLeft =
    !disabled && betDirection === 'NO' && !isStatusAFailure(betStatus)

  const swipingRight =
    !disabled && betDirection === 'YES' && !isStatusAFailure(betStatus)
  return (
    <Row className="relative mb-4 w-full justify-center gap-5">
      <Row className="text-ink-0 relative items-center gap-0.5">
        <button
          className={clsx(
            'absolute -left-[100px] z-20 flex h-16 flex-col justify-center rounded-[4rem] border-2 font-semibold transition-all',
            !disabled
              ? 'active:bg-scarlet-300 active:border-scarlet-300 active:text-ink-1000'
              : 'border-ink-200 text-ink-200 w-16 pl-4',
            swipingLeft
              ? 'bg-scarlet-300 border-scarlet-300 text-ink-0 w-[188px] pl-[74px]'
              : 'border-scarlet-200 text-scarlet-200 w-16 pl-4',
            swipingLeft && betStatus === 'success'
              ? 'bg-scarlet-500 border-scarlet-500'
              : ''
          )}
          disabled={disabled}
          onClick={() => {
            onBet('NO')
          }}
        >
          <Col>
            <div className="text-xs font-light">Bet</div>
            <div>NO</div>
          </Col>
        </button>
        {swipingLeft && (
          <div className="absolute -left-20 z-30">
            {betStatus === 'loading' && (
              <LoadingIndicator size="md" spinnerClassName="border-ink-1000" />
            )}
            {betStatus === 'success' && (
              <CheckCircleIcon className={'text-ink-0 h-7 w-7'} />
            )}
          </div>
        )}
        <TouchButton
          pressState={'sub'}
          setPressState={setPressState}
          disabled={disabled}
          children={
            <MinusIcon
              className={clsx(
                swipingRight || swipingLeft ? 'opacity-0' : '',
                'active:bg-canvas-0 active:text-ink-1000 z-10 h-8 w-8 rounded-full border p-1 transition-colors'
              )}
            />
          }
          className={'opacity-70'}
        />

        <Row className="z-30 mx-1 w-10 justify-center py-4 text-white">
          {disabled ? formatMoney(STARTING_BET_AMOUNT) : formatMoney(amount)}
        </Row>

        <TouchButton
          pressState={'add'}
          setPressState={setPressState}
          disabled={disabled}
          children={
            <PlusIcon
              className={clsx(
                swipingRight || swipingLeft ? 'opacity-0' : '',
                'active:bg-canvas-0 active:text-ink-1000 z-10 h-8 w-8 rounded-full border p-1 transition-colors'
              )}
            />
          }
          className={'opacity-70'}
        />
        <button
          className={clsx(
            'active:text-ink-0 absolute -right-[100px] z-20 flex h-16 flex-col justify-center rounded-full border-2 font-semibold transition-all active:border-teal-600 active:bg-teal-600',
            swipingRight
              ? 'text-ink-0 w-[188px] border-teal-500 bg-teal-500 pl-[74px]'
              : 'w-16 border-teal-300 bg-inherit pl-[13px] text-teal-300',
            swipingRight && betStatus === 'success'
              ? 'border-teal-600 bg-teal-600'
              : ''
          )}
          disabled={disabled}
          onClick={() => {
            onBet('YES')
          }}
        >
          <Col>
            <div className="text-xs font-light">Bet</div>
            <div>YES</div>
          </Col>
        </button>
        {swipingRight && (
          <div className="absolute -right-20 z-30">
            {betStatus === 'loading' && (
              <LoadingIndicator size="md" spinnerClassName="border-ink-1000" />
            )}
            {betStatus === 'success' && (
              <CheckCircleIcon className={'text-ink-0 h-7 w-7'} />
            )}
          </div>
        )}
      </Row>
      {isStatusAFailure(betStatus) && (
        <div className="line-clamp-1 absolute -bottom-6 left-[calc(50%-136px)] w-[272px] text-xs text-red-400">
          ERROR: {betStatus}
        </div>
      )}
    </Row>
  )
}

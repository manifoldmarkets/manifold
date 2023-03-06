import { useState } from 'react'
import clsx from 'clsx'

import { Button } from 'web/components/buttons/button'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Tooltip } from '../widgets/tooltip'
import { CPMMContract } from 'common/contract'
import { User } from 'common/user'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { LiquidityModal } from './liquidity-modal'

export function LiquidityButton(props: {
  contract: CPMMContract
  user: User | undefined | null
}) {
  const { contract, user } = props
  const { totalLiquidity: total } = contract

  const lp = useLiquidity(contract.id)
  const userActive = lp?.find((l) => l.userId === user?.id) !== undefined

  const [open, setOpen] = useState(false)

  const disabled =
    contract.isResolved || (contract.closeTime ?? Infinity) < Date.now()

  return (
    <Tooltip
      text={`${formatMoney(total)} in liquidity subsidies`}
      placement="bottom"
      noTap
      noFade
    >
      <LiquidityIconButton
        total={total}
        userActive={userActive}
        onClick={() => setOpen(true)}
        disabled={disabled}
      />
      <LiquidityModal contract={contract} isOpen={open} setOpen={setOpen} />
    </Tooltip>
  )
}

function LiquidityIconButton(props: {
  total: number
  onClick: () => void
  userActive: boolean
  isCompact?: boolean
  disabled?: boolean
}) {
  const { total, userActive, isCompact, onClick, disabled } = props

  return (
    <Button
      size={'sm'}
      className={clsx(
        'max-w-xs self-center pt-1',
        isCompact && 'px-0 py-0',
        disabled && 'hover:bg-inherit'
      )}
      color={'gray-white'}
      onClick={onClick}
      disabled={disabled}
    >
      <Col className={'relative items-center sm:flex-row'}>
        <span
          className={clsx(
            'text-xl sm:text-2xl',
            total > 0 ? 'mr-2' : '',
            userActive ? '' : 'grayscale'
          )}
        >
          💧
        </span>
        {total > 0 && (
          <div
            className={clsx(
              'bg-canvas-500 text-ink-0 absolute ml-3.5 mt-2 h-4 w-4 rounded-full align-middle sm:mt-3 sm:h-5 sm:w-5 sm:px-1',
              total > 99
                ? 'text-[0.4rem] sm:text-[0.5rem]'
                : 'sm:text-2xs text-[0.5rem]'
            )}
          >
            {shortFormatNumber(total)}
          </div>
        )}
      </Col>
    </Button>
  )
}

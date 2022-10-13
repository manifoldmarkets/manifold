import clsx from 'clsx'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Tooltip } from '../tooltip'
import TipJar from 'web/public/custom-components/tipJar'
import { useState } from 'react'

export function TipButton(props: {
  tipAmount: number
  totalTipped: number
  onClick: () => void
  userTipped: boolean
  isCompact?: boolean
  disabled?: boolean
}) {
  const { tipAmount, totalTipped, userTipped, onClick, disabled } = props

  const tipDisplay = shortFormatNumber(Math.ceil(totalTipped / 10))

  const [hover, setHover] = useState(false)

  return (
    <Tooltip
      text={
        disabled
          ? `Tips (${formatMoney(totalTipped)})`
          : `Tip ${formatMoney(tipAmount)}`
      }
      placement="bottom"
      noTap
      noFade
    >
      <button
        onClick={onClick}
        disabled={disabled}
        className={clsx(
          'px-2 py-1 text-xs', //2xs button
          'text-greyscale-6 transition-transform hover:text-indigo-600 disabled:cursor-not-allowed',
          !disabled ? 'hover:rotate-12' : ''
        )}
        onMouseOver={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Col className={clsx('relative', disabled ? 'opacity-30' : '')}>
          <TipJar
            size={18}
            color={userTipped || (hover && !disabled) ? '#4f46e5' : '#66667C'}
          />
          <div
            className={clsx(
              ' absolute top-[2px] text-[0.5rem]',
              tipDisplay.length === 1
                ? 'left-[7px]'
                : tipDisplay.length === 2
                ? 'left-[4.5px]'
                : tipDisplay.length > 2
                ? 'left-[4px] top-[2.5px] text-[0.35rem]'
                : ''
            )}
          >
            {totalTipped > 0 ? tipDisplay : ''}
          </div>
        </Col>
      </button>
    </Tooltip>
  )
}

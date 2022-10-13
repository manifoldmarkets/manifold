import clsx from 'clsx'
import { HeartIcon } from '@heroicons/react/outline'

import { Button } from 'web/components/button'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Tooltip } from '../tooltip'
import TipJar from 'web/public/custom-components/tipJar'

export function TipButton(props: {
  tipAmount: number
  totalTipped: number
  onClick: () => void
  userTipped: boolean
  isCompact?: boolean
  disabled?: boolean
}) {
  const { tipAmount, totalTipped, userTipped, isCompact, onClick, disabled } =
    props

  const tipDisplay = shortFormatNumber(Math.ceil(totalTipped / 10))

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
      <Button
        size={'sm'}
        className={clsx(
          'max-w-xs self-center',
          isCompact && 'px-0 py-0',
          disabled && 'hover:bg-inherit'
        )}
        color={'gray-white'}
        onClick={onClick}
        disabled={disabled}
      >
        <Col
          className={
            'relative items-center transition-transform hover:rotate-12 sm:flex-row'
          }
        >
          <TipJar />
          <div
            className={clsx(
              'bg-greyscale-5 absolute rounded-full text-white',
              tipDisplay.length > 2
                ? 'text-[0.4rem] sm:text-[0.5rem]'
                : 'text-[0.5rem]'
            )}
          >
            {totalTipped > 0 ? tipDisplay : ''}
          </div>
        </Col>
      </Button>
    </Tooltip>
  )
}

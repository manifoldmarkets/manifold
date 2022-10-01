import { HeartIcon } from '@heroicons/react/outline'
import { Button } from 'web/components/button'
import { formatMoney } from 'common/util/format'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { Tooltip } from '../tooltip'

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

  return (
    <Tooltip
      text={`Tip ${formatMoney(tipAmount)}`}
      placement="bottom"
      noTap
      noFade
    >
      <Button
        size={'sm'}
        className={clsx('max-w-xs self-center', isCompact && 'px-0 py-0')}
        color={'gray-white'}
        onClick={onClick}
        disabled={disabled}
      >
        <Col className={'relative items-center sm:flex-row'}>
          <HeartIcon
            className={clsx(
              'h-5 w-5 sm:h-6 sm:w-6',
              totalTipped > 0 ? 'mr-2' : '',
              userTipped ? 'fill-green-700 text-green-700' : ''
            )}
          />
          {totalTipped > 0 && (
            <div
              className={clsx(
                'bg-greyscale-5 absolute ml-3.5 mt-2 h-4 w-4 rounded-full align-middle text-white sm:mt-3 sm:h-5 sm:w-5 sm:px-1',
                totalTipped > 99
                  ? 'text-[0.4rem] sm:text-[0.5rem]'
                  : 'sm:text-2xs text-[0.5rem]'
              )}
            >
              {totalTipped}
            </div>
          )}
        </Col>
      </Button>
    </Tooltip>
  )
}

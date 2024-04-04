import clsx from 'clsx'
import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/solid'
import { Row } from '../layout/row'
import { Button } from '../buttons/button'

export function SpecialYesNoSelector(props: {
  selected?: 'YES' | 'NO' | 'LIMIT' | undefined
  onSelect: (selected: 'YES' | 'NO') => void
  prob: number
  className?: string
  yesLabel?: string
  noLabel?: string
  disabled?: boolean
  highlight?: boolean
}) {
  const {
    selected,
    onSelect,
    prob,
    className,
    yesLabel,
    noLabel,
    disabled,
    highlight,
  } = props
  const aboveLimit = prob >= 0.99
  const nearlyAboveLimit = prob >= 0.98
  const belowLimit = prob <= 0.01
  const nearlyBelowLimit = prob <= 0.02
  const yesWidth = aboveLimit ? 0 : (1 - prob) * 100
  const noWidth = belowLimit ? 0 : prob * 100

  return (
    <Row className={clsx('space-x-3', className)}>
      <Button
        color={
          (highlight && !selected) || selected === 'YES'
            ? 'green'
            : 'green-outline'
        }
        size="xl"
        style={{ width: `${yesWidth}%` }}
        onClick={() => onSelect('YES')}
        className={clsx(
          aboveLimit ? '!p-1' : nearlyAboveLimit ? '!px-3' : '',
          selected === 'YES' && 'opacity-75',
          selected !== undefined ? '!rounded-full' : '',
          'z-10'
        )}
        disabled={disabled}
      >
        {yesLabel ? yesLabel : 'YES'}
        <ArrowUpIcon className="ml-1 h-4 w-4" />
      </Button>
      <Button
        color={
          (highlight && !selected) || selected === 'NO' ? 'red' : 'red-outline'
        }
        size="xl"
        style={{ width: `${noWidth}%` }}
        onClick={() => onSelect('NO')}
        className={clsx(
          belowLimit ? '!p-1' : nearlyBelowLimit ? '!px-3' : '',
          selected === 'NO' && 'opacity-75',
          selected !== undefined ? '!rounded-full' : '',
          'z-10'
        )}
        disabled={disabled}
      >
        {noLabel ? noLabel : 'NO'}
        <ArrowDownIcon className="ml-1 h-4 w-4" />
      </Button>
    </Row>
  )
}

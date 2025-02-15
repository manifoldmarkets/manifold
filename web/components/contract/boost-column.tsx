import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'
import { Placement } from '@floating-ui/react'
import { BsRocketTakeoff } from 'react-icons/bs'

export function BoostedTooltip(props: {
  boosted: boolean
  placement?: Placement
  className?: string
  iconClassName?: string
}) {
  const { boosted, placement = 'top', className, iconClassName } = props

  return (
    <Tooltip
      text={boosted ? `Boosted market` : ''}
      placement={placement}
      noTap
      className={clsx(
        'text-ink-400 flex flex-row items-center gap-0.5',
        className
      )}
      tooltipClassName="z-40"
    >
      {boosted ? <BsRocketTakeoff className={iconClassName} /> : null}
    </Tooltip>
  )
}

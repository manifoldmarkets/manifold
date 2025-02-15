import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'
import { PlusTier } from 'web/public/custom-components/tiers'
import { Placement } from '@floating-ui/react'
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
      className={clsx('flex flex-row items-center gap-0.5', className)}
      tooltipClassName="z-40"
    >
      {boosted ? <PlusTier className={iconClassName} /> : null}
    </Tooltip>
  )
}

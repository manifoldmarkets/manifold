import { Contract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { Row } from '../layout/row'
import { ClockIcon, StarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

export function ReasonChosen(props: {
  contract: Contract
  reason?: string
  className?: string
}) {
  const { contract, className } = props
  const { createdTime, closeTime, uniqueBettorCount } = contract

  const now = Date.now()
  const reason = props.reason
    ? props.reason
    : createdTime > now - DAY_MS
    ? 'New'
    : closeTime && closeTime < now + DAY_MS
    ? 'Closing soon'
    : !uniqueBettorCount || uniqueBettorCount <= 5
    ? 'For you'
    : 'Trending'

  return (
    <Row className={clsx('text-ink-500 gap-3 text-xs', className)}>
      <div className="flex items-center gap-1 text-right">
        {reason}
        {reason === 'New' && <StarIcon className="h-4 w-4" />}
      </div>
    </Row>
  )
}

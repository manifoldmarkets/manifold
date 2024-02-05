import { BadgeCheckIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { CompatibilityScore } from 'common/love/compatibility-score'
import { formatPercent } from 'common/util/format'
import { Row } from 'web/components/layout/row'

export const CompatibleBadge = (props: {
  compatibility: CompatibilityScore
  className?: string
}) => {
  const { compatibility, className } = props
  return (
    <Row
      className={clsx(
        'items-center gap-1 text-sm font-semibold',
        className
      )}
    >
      <BadgeCheckIcon className="h-4 w-4" />
      {formatPercent(compatibility.score ?? 0)}{' '}
    </Row>
  )
}

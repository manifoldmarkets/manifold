import { HistoryPoint } from 'common/chart'
import { TooltipProps, formatDateInRange } from '../helpers'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserHovercard } from 'web/components/user/user-hovercard'

// for markets over a single value

export type SingleContractPoint = HistoryPoint<{
  userAvatarUrl?: string
  userId?: string
}>

export const SingleContractChartTooltip = (props: {
  ttProps: TooltipProps<SingleContractPoint>
  xScale: any
  formatY: (y: number) => string
}) => {
  const { ttProps, xScale, formatY } = props
  const { prev, next, x } = ttProps
  if (!prev) return null

  const d = xScale.invert(x)
  const [start, end] = xScale.domain()
  const dateLabel = formatDateInRange(d, start, end)

  return (
    <Row className="items-center gap-2">
      {prev.obj?.userAvatarUrl && prev.obj?.userId && (
        <UserHovercard userId={prev.obj.userId}>
          <Avatar size="xs" avatarUrl={prev.obj.userAvatarUrl} />
        </UserHovercard>
      )}
      <span className="font-semibold">{next ? dateLabel : 'Now'}</span>
      <span className="text-ink-600">{formatY(prev.y)}</span>
    </Row>
  )
}

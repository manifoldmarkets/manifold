import { HistoryPoint } from 'common/chart'
import { TooltipProps, formatDateInRange, formatPct } from '../helpers'
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

export const MultiBinaryChartTooltip = (props: {
  ttProps: TooltipProps<SingleContractPoint>
  xScale: any
  topColor: string
  topLabel: string
  bottomColor: string
  bottomLabel: string
}) => {
  const { ttProps, xScale, topColor, topLabel, bottomColor, bottomLabel } =
    props
  const { prev, next, x } = ttProps
  if (!prev) return null

  const d = xScale.invert(x)
  const [start, end] = xScale.domain()
  const dateLabel = formatDateInRange(d, start, end)

  // `prev.y` is the main (first) answer's probability, drawn as the bottom
  // band; the other answer fills the top band.
  return (
    <div>
      <div>{next ? dateLabel : 'Now'}</div>
      <MultiBinaryTooltipRow
        label={topLabel}
        color={topColor}
        value={formatPct(1 - prev.y)}
      />
      <MultiBinaryTooltipRow
        label={bottomLabel}
        color={bottomColor}
        value={formatPct(prev.y)}
      />
    </div>
  )
}

const MultiBinaryTooltipRow = (props: {
  label: string
  color: string
  value: string
}) => {
  const { label, color, value } = props
  return (
    <div
      className="flex items-center justify-between gap-3 text-base font-semibold"
      style={{ color }}
    >
      <span className="max-w-[8rem] truncate">{label}</span>
      <span>{value}</span>
    </div>
  )
}

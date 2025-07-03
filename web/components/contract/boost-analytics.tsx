import { Contract } from 'common/contract'
import { formatLargeNumber } from 'common/util/format'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import dayjs from 'dayjs'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import Link from 'next/link'

type BoostPeriod = {
  startTime: string
  endTime: string
  creatorName?: string
  creatorUsername?: string
}

type BoostAnalytics = {
  uniqueViewers: number
  totalViews: number
  uniquePromotedViewers: number
  totalPromotedViews: number
  boostPeriods: BoostPeriod[]
}

export function BoostAnalytics(props: { contract: Contract }) {
  const { contract } = props

  const { data: analytics, loading } = useAPIGetter('get-boost-analytics', {
    contractId: contract.id,
  })

  if (!analytics || !analytics.boostPeriods || loading) {
    return null
  }

  const {
    uniqueViewers,
    totalViews,
    uniquePromotedViewers,
    totalPromotedViews,
    boostPeriods,
  } = analytics

  const formatBoostPeriod = (period: BoostPeriod) => {
    const start = dayjs(period.startTime).format('MMM D')
    const creatorElement =
      period.creatorName && period.creatorUsername ? (
        <span>
          {' by '}
          <Link
            href={`/${period.creatorUsername}`}
            className="text-primary-700 hover:underline"
          >
            {period.creatorName}
          </Link>
        </span>
      ) : null
    const end = dayjs(period.endTime).format('MMM D')
    return (
      <span>
        {start} - {end}
        {creatorElement}
      </span>
    )
  }

  return (
    <Col className="gap-2">
      <div className="text-ink-600 text-sm font-medium">Boost Analytics</div>
      <Row className="flex-wrap gap-6">
        <Col className="gap-1">
          <div className="text-ink-500 text-xs">Total Views</div>
          <div className="text-ink-900 text-lg font-semibold">
            {formatLargeNumber(totalViews)}
          </div>
        </Col>
        <Col className="gap-1">
          <div className="text-ink-500 text-xs">Unique Viewers</div>
          <div className="text-ink-900 text-lg font-semibold">
            {formatLargeNumber(uniqueViewers)}
          </div>
        </Col>
        <Col className="gap-1">
          <div className="text-ink-500 text-xs">Promoted Views</div>
          <div className="text-ink-900 text-lg font-semibold">
            {formatLargeNumber(totalPromotedViews)}
          </div>
        </Col>
        <Col className="gap-1">
          <div className="text-ink-500 text-xs">Unique Promoted Viewers</div>
          <div className="text-ink-900 text-lg font-semibold">
            {formatLargeNumber(uniquePromotedViewers)}
          </div>
        </Col>
      </Row>
      {boostPeriods.length > 0 && (
        <Row className="text-ink-500 flex-wrap gap-1 text-xs">
          <div>Boost periods:</div>
          {boostPeriods.map((period, i) => (
            <div key={i}>
              {formatBoostPeriod(period)}
              {i !== boostPeriods.length - 1 && ', '}
            </div>
          ))}
        </Row>
      )}
    </Col>
  )
}

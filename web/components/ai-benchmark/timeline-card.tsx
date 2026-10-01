import { Card } from 'web/components/widgets/card'
import { AITimelineData } from 'web/lib/ai/types'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import Link from 'next/link'
import { contractPath } from 'common/contract'
import { ClockIcon } from '@heroicons/react/solid'
import { formatPercent } from 'common/util/format'

export function TimelineCard({ aiTimeline }: { aiTimeline: AITimelineData[] }) {
  return (
    <Card className="p-4">
      <Col className="gap-4">
        <Row className="items-center">
          <ClockIcon className="h-5 w-5 text-indigo-600 mr-2" />
          <div className="text-xl font-medium">AI Timeline Forecasts</div>
        </Row>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {aiTimeline.map((event) => (
            <Col key={event.name} className="gap-1 p-3 rounded-lg bg-canvas-50">
              {event.contract ? (
                <Link 
                  href={contractPath(event.contract)} 
                  className="font-medium hover:text-primary-600 hover:underline"
                >
                  {event.name}
                </Link>
              ) : (
                <div className="font-medium">{event.name}</div>
              )}
              <Row className="items-center gap-1">
                <span className="text-ink-500 text-sm">{event.description}</span>
                <InfoTooltip text={event.description} />
              </Row>
              <Row className="mt-2 justify-between">
                <div className="text-lg font-bold">{event.date}</div>
                {event.probability !== undefined && (
                  <div className="text-sm font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    {formatPercent(event.probability)}
                  </div>
                )}
              </Row>
            </Col>
          ))}
        </div>
      </Col>
    </Card>
  )
}

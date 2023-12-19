import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { Col } from 'web/components/layout/col'

export default function LoadingResults() {
  return (
    <Col className={'min-h-screen w-full items-center justify-center'}>
      <div
        style={{
          height: `300px`,
          width: `500px`,
        }}
      >
        <PlaceholderGraph className="text-ink-400 h-full w-full animate-pulse" />
      </div>
    </Col>
  )
}

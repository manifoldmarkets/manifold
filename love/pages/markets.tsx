import { LovePage } from 'love/components/love-page'
import { Col } from 'web/components/layout/col'

export default function MarketsPage() {
  return (
    <LovePage trackPageView="love markets">
      <Col className="mt-[15vh] self-center px-4">
        <div className="text-ink-400 max-w-md text-5xl leading-[3.5rem]">
          Prediction markets to forecast compatibility are{' '}
          <span className="text-primary-500">coming soon</span> as a premium
          feature!
        </div>
      </Col>
    </LovePage>
  )
}

import { LovePage } from 'love/components/love-page'
import { Col } from 'web/components/layout/col'

export default function MarketsPage() {
  return (
    <LovePage trackPageView="love markets">
      <Col className="mt-[15vh] self-center px-4">
        <div className="text-ink-400 max-w-md text-5xl leading-[3.5rem]">
          <div className="text-primary-500">Coming soon</div>
          Next generation prediction markets to forecast compatibility better
          than ever!
        </div>
      </Col>
    </LovePage>
  )
}

import { LovePage } from 'love/components/love-page'
import ManifoldLoveLogo from 'love/components/manifold-love-logo'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'

export default function FAQ() {
  return (
    <LovePage trackPageView={'faq'}>
      <SEO title="FAQ" description="Manifold.love FAQ" />

      <Col className="p-4">
        <Title className="hidden sm:flex">FAQ</Title>
        <ManifoldLoveLogo className="mb-4 flex sm:hidden" />

        <div className="mb-4 text-lg font-semibold">Coming soon...</div>
      </Col>
    </LovePage>
  )
}

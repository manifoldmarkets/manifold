import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'

export default function CommunityGuidelinesDevPage() {
  return (
    <Page trackPageView="community guidelines dev page" className="!col-span-7">
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-4xl font-bold text-primary-500">COMMUNITY GUIDELINES DEV ROUTE</h1>
        <p className="mt-2">This page is from /community-guidelines-dev.tsx.</p>
      </Col>
    </Page>
  )
}

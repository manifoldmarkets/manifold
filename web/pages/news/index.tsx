import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'

export default function NewsPage() {
  return (
    <Page trackPageView={'news page'}>
      <SEO
        title="News"
        description="Breaking news meets the wisdom of the crowd"
      />
      TODO: redirect (not permanently to the first item)
    </Page>
  )
}

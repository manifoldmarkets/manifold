import { PoliticsPage } from 'politics/components/politics-page'
import Link from 'next/link'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { ExternalLink } from 'web/components/widgets/external-link'
import { Title } from 'web/components/widgets/title'

export default function Custom404(props: { customText?: string }) {
  return (
    <PoliticsPage trackPageView={'404'}>
      <Custom404Content customText={props.customText} />
    </PoliticsPage>
  )
}

export function Custom404Content(props: { customText?: string }) {
  const { customText } = props
  return (
    <div className="flex h-[50vh] flex-col items-center justify-center">
      <Col className="max-w-sm">
        <Title>404: Oops!</Title>
        {customText && <p>{customText}</p>}
        {!customText && <p>Less than 1% chance anything exists at this url.</p>}
        <p>
          If you didn't expect this, let us know{' '}
          <ExternalLink
            href="https://discord.com/widget?id=915138780216823849&theme=dark"
            title="on Discord!"
          />
        </p>

        <Link href="/politics/public">
          <Button className="mt-6">Go home</Button>
        </Link>
      </Col>
    </div>
  )
}

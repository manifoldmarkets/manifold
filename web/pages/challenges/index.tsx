import clsx from 'clsx'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { linkClass } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'

export default function ChallengesListPage() {
  return (
    <Page>
      <SEO
        title="Challenges"
        description="Challenge your friends to a bet!"
        url="/send"
      />

      <Col className="w-full px-8">
        <Row className="items-center justify-between">
          <Title children="Challenges" />
        </Row>
        <p className="italic">
          We no longer support challenges.
          <br />
          If you want to bet mana against your friend directly, try{' '}
          <a
            href="https://www.wagerwith.me/"
            className={clsx('text-primary-700', linkClass)}
          >
            wagerwith.me
          </a>
        </p>
      </Col>
    </Page>
  )
}

import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import Welcome from 'web/components/onboarding/welcome'
import { Title } from 'web/components/widgets/title'

import GroupSearch from 'web/components/groups/group-search'
import { useUser } from 'web/hooks/use-user'

export default function Search() {
  const user = useUser()

  return (
    <>
      {user && <Welcome />}

      <Page trackPageView={'search'}>
        <SEO
          title="Questions"
          description="Browse all questions."
          url="/questions"
        />
        <Col className="mx-auto w-full">
          <Title className="hidden lg:flex">Questions</Title>
          <GroupSearch persistPrefix={'groups-search'} />
        </Col>
      </Page>
    </>
  )
}

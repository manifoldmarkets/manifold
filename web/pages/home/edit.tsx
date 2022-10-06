import clsx from 'clsx'
import { useState } from 'react'
import { ArrangeHome } from 'web/components/arrange-home'
import { Button } from 'web/components/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SiteLink } from 'web/components/site-link'
import { Title } from 'web/components/title'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { updateUser } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { getHomeItems } from '.'

export default function Home() {
  const user = useUser()

  useTracking('edit home')

  const [homeSections, setHomeSections] = useState(user?.homeSections ?? [])

  const updateHomeSections = (newHomeSections: string[]) => {
    if (!user) return
    updateUser(user.id, { homeSections: newHomeSections })
    setHomeSections(newHomeSections)
  }

  const { sections } = getHomeItems(homeSections)

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 px-4 pb-6 pt-2">
        <Row className={'w-full items-center justify-between'}>
          <Title text="Customize your home page" />
          <DoneButton />
        </Row>

        <Col className="flex-1">
          <ArrangeHome sections={sections} setSectionIds={updateHomeSections} />
        </Col>
      </Col>
    </Page>
  )
}

function DoneButton(props: { className?: string }) {
  const { className } = props

  return (
    <SiteLink href="/home">
      <Button
        size="lg"
        color="blue"
        className={clsx(className, 'flex whitespace-nowrap')}
        onClick={() => track('done editing home')}
      >
        Done
      </Button>
    </SiteLink>
  )
}

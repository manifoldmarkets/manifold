import { ProbChangeTable } from 'web/components/contract/prob-change-table'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { useProbChangesAlgolia } from 'web/hooks/use-prob-changes'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'

export default function DailyMovers() {
  const user = useUser()

  const changes = useProbChangesAlgolia(user?.id ?? '')

  useTracking('view daily movers')

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Title className="mx-4 !mb-0 sm:mx-0" text="Daily movers" />
        <ProbChangeTable changes={changes} full />
      </Col>
    </Page>
  )
}

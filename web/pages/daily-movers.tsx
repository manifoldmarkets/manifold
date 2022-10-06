import { ProbChangeTable } from 'web/components/contract/prob-change-table'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { useProbChanges } from 'web/hooks/use-prob-changes'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'

export default function DailyMovers() {
  const user = useUser()
  useTracking('view daily movers')

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Title className="mx-4 !mb-0 sm:mx-0" text="Daily movers" />
        {user && <ProbChangesWrapper userId={user.id} />}
      </Col>
    </Page>
  )
}

function ProbChangesWrapper(props: { userId: string }) {
  const { userId } = props

  const changes = useProbChanges({ bettorId: userId })?.filter(
    (c) => Math.abs(c.probChanges.day) >= 0.01
  )

  return <ProbChangeTable changes={changes} full />
}

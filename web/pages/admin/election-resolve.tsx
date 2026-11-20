import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { NoSEO } from 'web/components/NoSEO'
import { ModActionTag } from 'web/components/moderation/mod-action'
import { ElectionResolveTool } from 'web/components/admin/election-resolve-tool'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'

export default function ElectionResolvePage() {
  const user = useUser()
  const isAdmin = useAdmin()

  if (!user || !isAdmin) {
    return (
      <Page trackPageView="admin-election-resolve">
        <NoSEO />
        <Col className="items-center justify-center py-20">
          <p className="text-ink-500">Admin access required</p>
        </Col>
      </Page>
    )
  }

  return (
    // The table needs more than the default content column.
    <Page trackPageView="admin-election-resolve" className="lg:col-span-10">
      <NoSEO />
      <Col className="gap-4 px-2 pb-24 sm:px-4">
        <Title className="!mb-0">
          Election map resolutions
          <ModActionTag admin className="ml-2 align-middle" />
        </Title>
        <ElectionResolveTool />
      </Col>
    </Page>
  )
}

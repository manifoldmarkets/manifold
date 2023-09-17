import { Dashboard, DashboardItem } from 'common/dashboard'
import { getDashboardFromSlug } from 'common/supabase/dashboard'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { AddDashboardItemWidget } from 'web/components/dashboard/add-dashboard-item'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
import { DashboardSidebar } from 'web/components/dashboard/dashboard-sidebar'
import { FollowDashboardButton } from 'web/components/dashboard/follow-dashboard-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { updateDashboard } from 'web/lib/firebase/api'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import Custom404 from '../404'

export async function getStaticProps(ctx: {
  params: { dashboardSlug: string }
}) {
  const { dashboardSlug } = ctx.params
  const adminDb = await initSupabaseAdmin()

  try {
    const dashboard: Dashboard = await getDashboardFromSlug(
      dashboardSlug,
      adminDb
    )
    return { props: { initialDashboard: dashboard } }
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 404) {
      return {
        props: { state: 'not found' },
        revalidate: 60,
      }
    }
    throw e
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function DashboardPage(props: { initialDashboard: Dashboard }) {
  const { initialDashboard } = props
  const [dashboard, setDashboard] = useState<Dashboard>(initialDashboard)
  const [items, setItems] = useState<DashboardItem[]>(dashboard?.items)
  const user = useUser()
  const canEdit = dashboard.creator_id === user?.id
  const [editMode, setEditMode] = useState(false)
  if (!dashboard) {
    return <Custom404 />
  }

  return (
    <Page
      trackPageView={'dashboard slug page'}
      trackPageProps={{ slug: dashboard.slug, title: dashboard.title }}
      rightSidebar={
        <DashboardSidebar description={dashboard.description} inSidebar />
      }
    >
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-1 sm:px-2">
          <Row className="gap-2">
            <Avatar
              username={dashboard.creator_username}
              avatarUrl={dashboard.creator_avatar_url}
              size="xs"
            />
            <UserLink
              username={dashboard.creator_username}
              name={dashboard.creator_name}
            />
          </Row>
          <Row className="w-full items-center justify-between">
            <Title>{dashboard.title}</Title>
            <Row>
              <FollowDashboardButton
                dashboardId={dashboard.id}
                dashboardCreatorId={dashboard.creator_id}
              />
              {canEdit && !editMode && (
                <Button onClick={() => setEditMode((editMode) => !editMode)}>
                  Edit
                </Button>
              )}
            </Row>
          </Row>

          <DashboardSidebar description={dashboard.description} />
          <DashboardContent
            items={items}
            onRemove={(slugOrUrl: string) => {
              setItems((items) => {
                return items.filter((item) => {
                  if (item.type === 'question') {
                    return item.slug !== slugOrUrl
                  } else if (item.type === 'link') {
                    return item.url !== slugOrUrl
                  }
                  return true
                })
              })
            }}
            isEditing={editMode}
          />
          {editMode && (
            <Col className="gap-4">
              <AddDashboardItemWidget items={items} setItems={setItems} />
              <Row className="w-full justify-end gap-2">
                <Button
                  color="gray"
                  onClick={() => {
                    setItems(dashboard.items)
                    setEditMode(false)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={items.length < 2}
                  onClick={() => {
                    if (items !== dashboard.items) {
                      updateDashboard({
                        dashboardId: dashboard.id,
                        items,
                      }).then((resultingDashboard) => {
                        if (
                          resultingDashboard &&
                          resultingDashboard.updateDashboard
                        ) {
                          setDashboard(
                            resultingDashboard.updateDashboard as Dashboard
                          )
                        }
                      })
                    }
                    setEditMode(false)
                  }}
                >
                  Save
                </Button>
              </Row>
            </Col>
          )}
        </Col>
      </Col>
    </Page>
  )
}

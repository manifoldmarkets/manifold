import { Dashboard, DashboardItem } from 'common/dashboard'
import { getDashboardFromSlug } from 'common/supabase/dashboard'
import { useEffect, useState } from 'react'
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
import { useDashboardFromSlug } from 'web/hooks/use-dashboard'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { JSONEmpty } from 'web/components/contract/contract-description'
import clsx from 'clsx'
import { JSONContent } from '@tiptap/core'
import { Editor } from '@tiptap/react'
import { PlusIcon } from '@heroicons/react/solid'

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
    return { props: { initialDashboard: dashboard, slug: dashboardSlug } }
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

export default function DashboardPage(props: {
  initialDashboard: Dashboard
  slug: string
}) {
  const { initialDashboard, slug } = props
  const fetchedDashboard = useDashboardFromSlug(slug)
  const [dashboard, setDashboard] = useState<Dashboard>(
    fetchedDashboard ?? initialDashboard
  )

  // Update the dashboard state if a new fetchedDashboard becomes available
  useEffect(() => {
    if (fetchedDashboard) {
      setDashboard(fetchedDashboard)
    }
  }, [fetchedDashboard])

  const updateItems = (newItems: DashboardItem[]) => {
    if (dashboard) {
      const updatedDashboard = { ...dashboard, items: newItems }
      setDashboard(updatedDashboard)
    }
  }

  const user = useUser()
  const canEdit = dashboard.creator_id === user?.id
  const [editMode, setEditMode] = useState(false)

  const editor = useTextEditor({
    key: `edit dashboard ${slug}`,
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: dashboard.description,
    placeholder: 'Optional. Provide background info and details.',
  })

  const isNotXl = useIsMobile(1280)
  if (!dashboard) {
    return <Custom404 />
  }

  return (
    <Page
      trackPageView={'dashboard slug page'}
      trackPageProps={{ slug: dashboard.slug, title: dashboard.title }}
      rightSidebar={
        editMode && !isNotXl ? (
          <DescriptionEditor
            editor={editor}
            description={dashboard.description}
          />
        ) : (
          <DashboardSidebar description={dashboard.description} inSidebar />
        )
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
          {editMode && isNotXl ? (
            <DescriptionEditor
              editor={editor}
              description={dashboard.description}
              className="mb-4"
            />
          ) : (
            <DashboardSidebar description={dashboard.description} />
          )}
          <DashboardContent
            items={dashboard.items}
            onRemove={(slugOrUrl: string) => {
              updateItems(
                dashboard.items.filter((item) => {
                  if (item.type === 'question') {
                    return item.slug !== slugOrUrl
                  } else if (item.type === 'link') {
                    return item.url !== slugOrUrl
                  }
                  return true
                })
              )
            }}
            isEditing={editMode}
          />
          {editMode && (
            <Col className="gap-4">
              <AddDashboardItemWidget
                items={dashboard.items}
                setItems={updateItems}
              />
              <Row className="w-full justify-end gap-2">
                <Button
                  color="gray"
                  onClick={() => {
                    // reset items to original state
                    updateItems(
                      fetchedDashboard
                        ? fetchedDashboard.items
                        : initialDashboard.items
                    )
                    setEditMode(false)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={dashboard.items.length < 2}
                  onClick={() => {
                    updateDashboard({
                      dashboardId: dashboard.id,
                      items: dashboard.items,
                      description: editor?.getJSON(),
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

function DescriptionEditor(props: {
  description: JSONContent
  editor: Editor | null
  className?: string
}) {
  const { description, editor, className } = props
  const [editDescription, setEditDescription] = useState(false)
  const noDescription = !description || JSONEmpty(description)
  if (noDescription && !editDescription) {
    return (
      <Button
        className={clsx(className, 'w-full')}
        color="gray-outline"
        onClick={() => setEditDescription(true)}
      >
        <PlusIcon className="mr-2 h-5 w-5" />
        Add description
      </Button>
    )
  }
  if (editor) {
    return <TextEditor editor={editor} className={className} />
  }
  return <></>
}

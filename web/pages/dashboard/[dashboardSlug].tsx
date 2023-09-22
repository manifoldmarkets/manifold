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
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { SEO } from 'web/components/SEO'
import { richTextToString } from 'common/util/parse'
import { DashboardComments } from 'web/components/dashboard/dashboard-comments'

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

  const updateTitle = (newTitle: string) => {
    if (dashboard) {
      const updatedDashboard = { ...dashboard, title: newTitle }
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
      mainClassName="items-center"
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
      <SEO
        title={dashboard.title}
        description={
          JSONEmpty(dashboard.description)
            ? `dashboard created by ${dashboard.creator_name}`
            : richTextToString(dashboard.description)
        }
      />
      <Col className="w-full max-w-2xl px-1 sm:px-2">
        <Row className="mb-2 mt-2 items-center justify-between first-letter:w-full sm:mt-4 lg:mt-0">
          {editMode ? (
            <ExpandingInput
              placeholder={'Dashboard Title'}
              autoFocus
              maxLength={150}
              value={dashboard.title}
              className="w-full"
              onChange={(e) => updateTitle(e.target.value)}
            />
          ) : (
            <Title className="!mb-0 ">{dashboard.title}</Title>
          )}
          <div className="flex items-center">
            <CopyLinkOrShareButton
              url={`https://${ENV_CONFIG.domain}/dashboard/${dashboard.slug}`}
              eventTrackingName="copy dashboard link"
              tooltip="Share"
            />

            <FollowDashboardButton
              dashboardId={dashboard.id}
              dashboardCreatorId={dashboard.creator_id}
              ttPlacement="bottom"
            />
            {canEdit && !editMode && (
              <Button onClick={() => setEditMode((editMode) => !editMode)}>
                Edit
              </Button>
            )}
          </div>
        </Row>
        <Row className="mb-8 gap-2">
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
          setItems={updateItems}
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
                    title: dashboard.title,
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
        {!editMode && <DashboardComments dashboard={dashboard} />}
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

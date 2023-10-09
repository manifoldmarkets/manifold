import { Dashboard, DashboardItem } from 'common/dashboard'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { AddItemCard } from 'web/components/dashboard/add-dashboard-item'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
import { DashboardDescription } from 'web/components/dashboard/dashboard-description'
import { FollowDashboardButton } from 'web/components/dashboard/follow-dashboard-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { getDashboardFromSlug, updateDashboard } from 'web/lib/firebase/api'
import Custom404 from '../404'
import { useDashboardFromSlug } from 'web/hooks/use-dashboard'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { JSONEmpty } from 'web/components/contract/contract-description'
import clsx from 'clsx'
import { JSONContent } from '@tiptap/core'
import { Editor } from '@tiptap/react'
import { PlusIcon } from '@heroicons/react/solid'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG, isAdminId } from 'common/envs/constants'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { SEO } from 'web/components/SEO'
import { richTextToString } from 'common/util/parse'
import { RelativeTimestamp } from 'web/components/relative-timestamp'

export async function getStaticProps(ctx: {
  params: { dashboardSlug: string }
}) {
  const { dashboardSlug } = ctx.params

  try {
    const dashboard = await getDashboardFromSlug({ dashboardSlug })

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
  const [dashboard, setDashboard] = useState<Dashboard>(initialDashboard)

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

  const updateTopics = (newTopics: string[]) => {
    if (dashboard) {
      const updatedDashboard = { ...dashboard, topics: newTopics }
      setDashboard(updatedDashboard)
    }
  }

  const user = useUser()
  const isCreator = dashboard.creatorId === user?.id
  const isOnlyAdmin = !isCreator && user && isAdminId(user.id)

  const [editMode, setEditMode] = useState(false)

  const editor = useTextEditor({
    key: `edit dashboard ${slug}`,
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: dashboard.description,
    placeholder: 'Optional. Provide background info and details.',
  })

  if (!dashboard) {
    return <Custom404 />
  }

  return (
    <Page
      trackPageView={'dashboard slug page'}
      trackPageProps={{ slug: dashboard.slug, title: dashboard.title }}
      className="items-center"
    >
      <SEO
        title={dashboard.title}
        description={
          JSONEmpty(dashboard.description)
            ? `dashboard created by ${dashboard.creatorName}`
            : richTextToString(dashboard.description)
        }
      />
      <Col className="w-full max-w-2xl px-1 sm:px-2">
        <Row className="my-2 items-center justify-between sm:mt-4 lg:mt-0">
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
            <>
              <Title className="!mb-0 ">{dashboard.title}</Title>

              <div className="flex items-center">
                <CopyLinkOrShareButton
                  url={`https://${ENV_CONFIG.domain}/dashboard/${dashboard.slug}`}
                  eventTrackingName="copy dashboard link"
                  tooltip="Share"
                />

                <FollowDashboardButton
                  dashboardId={dashboard.id}
                  dashboardCreatorId={dashboard.creatorId}
                  ttPlacement="bottom"
                />
                {isCreator && (
                  <Button onClick={() => setEditMode(true)}>Edit</Button>
                )}
                {isOnlyAdmin && (
                  <Button
                    color="red"
                    className="ml-6"
                    onClick={() => setEditMode(true)}
                  >
                    Edit as Admin
                  </Button>
                )}
              </div>
            </>
          )}
        </Row>
        {editMode ? (
          <Row className="bg-canvas-50 sticky top-0 z-20 mb-2 w-full items-center justify-end gap-2 self-start py-1">
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
                  topics: dashboard.topics,
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
        ) : (
          <Row className="mb-8 items-center gap-2">
            <Avatar
              username={dashboard.creatorUsername}
              avatarUrl={dashboard.creatorAvatarUrl}
              size="xs"
            />
            <UserLink
              username={dashboard.creatorUsername}
              name={dashboard.creatorName}
              className="text-ink-700"
            />
            <span className="text-ink-400 ml-4 text-sm">
              Edited
              <RelativeTimestamp time={dashboard.createdTime} />
            </span>
          </Row>
        )}
        {editMode ? (
          <DescriptionEditor
            editor={editor}
            description={dashboard.description}
            className="mb-4"
          />
        ) : (
          <DashboardDescription description={dashboard.description} />
        )}
        {editMode && (
          <div className="mb-4">
            <AddItemCard
              items={dashboard.items}
              setItems={updateItems}
              topics={dashboard.topics}
              setTopics={updateTopics}
            />
          </div>
        )}
        <DashboardContent
          items={dashboard.items}
          setItems={updateItems}
          topics={dashboard.topics}
          setTopics={updateTopics}
          isEditing={editMode}
        />
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
        <PlusIcon className="mr-2 h-6 w-6" />
        Add description
      </Button>
    )
  }
  if (editor) {
    return <TextEditor editor={editor} className={className} />
  }
  return <></>
}

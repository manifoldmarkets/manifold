import {
  Dashboard,
  DashboardItem,
  MAX_DASHBOARD_TITLE_LENGTH,
  convertDashboardSqltoTS,
} from 'common/dashboard'
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
import {
  deleteDashboard,
  getDashboardFromSlug,
  updateDashboard,
} from 'web/lib/firebase/api'
import Custom404 from '../404'
import { useDashboardFromSlug } from 'web/hooks/use-dashboard'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { JSONEmpty } from 'web/components/contract/contract-description'
import clsx from 'clsx'
import { Editor } from '@tiptap/react'
import { XCircleIcon } from '@heroicons/react/solid'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG, isAdminId } from 'common/envs/constants'
import { SEO } from 'web/components/SEO'
import { richTextToString } from 'common/util/parse'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { useWarnUnsavedChanges } from 'web/hooks/use-warn-unsaved-changes'
import { InputWithLimit } from 'web/components/dashboard/input-with-limit'
import Head from 'next/head'
import { useRouter } from 'next/router'

export async function getStaticProps(ctx: {
  params: { dashboardSlug: string }
}) {
  const { dashboardSlug } = ctx.params

  try {
    const dashboard = await getDashboardFromSlug({ dashboardSlug })

    return {
      props: {
        state: 'success',
        initialDashboard: dashboard,
        slug: dashboardSlug,
      },
    }
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

export default function DashboardPage(
  props:
    | {
        state: 'success'
        initialDashboard: Dashboard
        slug: string
      }
    | { state: 'not found' }
) {
  const router = useRouter()
  const edit = !!router.query.edit

  if (props.state === 'not found') {
    return <Custom404 />
  } else {
    return (
      <FoundDashbordPage
        initialDashboard={props.initialDashboard}
        slug={props.slug}
        editByDefault={edit}
      />
    )
  }
}

function FoundDashbordPage(props: {
  initialDashboard: Dashboard
  slug: string
  editByDefault: boolean
}) {
  const { initialDashboard, slug, editByDefault } = props
  const fetchedDashboard = useDashboardFromSlug(slug)
  const [dashboard, setDashboard] = useState<Dashboard>(initialDashboard)

  // Update the dashboard state if a new fetchedDashboard becomes available
  useEffect(() => {
    if (fetchedDashboard) {
      setDashboard(fetchedDashboard)
    }
  }, [fetchedDashboard])

  const updateItems = (newItems: DashboardItem[]) =>
    setDashboard({ ...dashboard, items: newItems })

  const updateTitle = (newTitle: string) =>
    setDashboard({ ...dashboard, title: newTitle })

  const updateTopics = (newTopics: string[]) =>
    setDashboard({ ...dashboard, topics: newTopics })

  const user = useUser()
  const isCreator = dashboard.creatorId === user?.id
  const isOnlyAdmin = !isCreator && user && isAdminId(user.id)

  const [editMode, setEditMode] = useState(editByDefault)
  useWarnUnsavedChanges(editMode)

  const editor = useTextEditor({
    size: 'lg',
    key: `edit dashboard ${slug}`,
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: dashboard.description,
    placeholder: 'Optional. Provide background info and details.',
  })

  const [showDescription, setShowDescription] = useState(false)
  const reallyShowDesc = editor && (!editor.isEmpty || showDescription)

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
      {dashboard.visibility === 'deleted' && (
        <>
          <Head>
            <meta name="robots" content="noindex, nofollow" />
          </Head>
          <div className="bg-error w-full rounded p-6 text-center text-lg text-white">
            Deleted by admins
          </div>
        </>
      )}

      <Col className="w-full max-w-2xl px-1 sm:px-2">
        <div className="my-2 sm:mt-4 lg:mt-0">
          {editMode ? (
            <InputWithLimit
              placeholder={'Dashboard Title'}
              text={dashboard.title}
              setText={updateTitle}
              limit={MAX_DASHBOARD_TITLE_LENGTH}
              className="!w-full !text-lg"
            />
          ) : (
            <Row className="items-center justify-between">
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
            </Row>
          )}
        </div>
        {editMode ? (
          <Row className="bg-canvas-50 sticky top-0 z-20 mb-2 w-full items-center justify-end gap-2 self-start py-1">
            {isOnlyAdmin && (
              <Button
                color="red"
                className="mr-auto"
                onClick={() => {
                  deleteDashboard({ dashboardId: dashboard.id })
                  setEditMode(false)
                }}
              >
                Delete dashboard
              </Button>
            )}
            <Button
              color="gray"
              onClick={() => {
                // reset to original state
                setDashboard(fetchedDashboard || initialDashboard)
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
                }).then((data) => {
                  if (data?.updateDashboard) {
                    setDashboard(
                      convertDashboardSqltoTS(data.updateDashboard) as any
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
              Created
              <RelativeTimestamp time={dashboard.createdTime} />
            </span>
          </Row>
        )}
        {editMode ? (
          reallyShowDesc && (
            <DescriptionEditor
              editor={editor}
              className="mb-4"
              onClose={() => setShowDescription(false)}
            />
          )
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
              createDescription={
                reallyShowDesc ? undefined : () => setShowDescription(true)
              }
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
  editor: Editor
  className?: string
  onClose: () => void
}) {
  const { editor, className, onClose } = props
  return (
    <div className={clsx('relative', className)}>
      <button
        className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0 z-10 transition-colors"
        onClick={() => {
          onClose?.()
          editor.commands.clearContent()
        }}
      >
        <XCircleIcon className="h-5 w-5" />
      </button>
      <TextEditor editor={editor} />
    </div>
  )
}

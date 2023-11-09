import {
  Dashboard,
  DashboardItem,
  DashboardLinkItem,
  MAX_DASHBOARD_TITLE_LENGTH,
  convertDashboardSqltoTS,
} from 'common/dashboard'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { AddItemCard } from 'web/components/dashboard/add-dashboard-item'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
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
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG, isAdminId, isTrustworthy } from 'common/envs/constants'
import { SEO } from 'web/components/SEO'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { useWarnUnsavedChanges } from 'web/hooks/use-warn-unsaved-changes'
import { InputWithLimit } from 'web/components/dashboard/input-with-limit'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { LinkPreviews, fetchLinkPreviews } from 'common/link-preview'

export async function getStaticProps(ctx: {
  params: { dashboardSlug: string }
}) {
  const { dashboardSlug } = ctx.params

  try {
    const dashboard = await getDashboardFromSlug({ dashboardSlug })
    const links = dashboard.items.filter(
      (item): item is DashboardLinkItem => item.type === 'link'
    )
    const previews = await fetchLinkPreviews(links.map((l) => l.url))

    return {
      props: {
        state: 'success',
        initialDashboard: dashboard,
        previews,
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
        previews: LinkPreviews
        slug: string
      }
    | { state: 'not found' }
) {
  const router = useRouter()
  const edit = !!router.query.edit

  if (props.state === 'not found') {
    return <Custom404 />
  } else {
    return <FoundDashboardPage {...props} editByDefault={edit} />
  }
}

function FoundDashboardPage(props: {
  initialDashboard: Dashboard
  previews: LinkPreviews
  slug: string
  editByDefault: boolean
}) {
  const { initialDashboard, slug, editByDefault, previews } = props
  const fetchedDashboard = useDashboardFromSlug(slug)
  const [dashboard, setDashboard] = useState<Dashboard>(initialDashboard)

  const isValid =
    dashboard.title.length > 0 &&
    dashboard.title.length <= MAX_DASHBOARD_TITLE_LENGTH

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
  const isOnlyMod =
    !isCreator && user && (isAdminId(user.id) || isTrustworthy(user.username))

  const [editMode, setEditMode] = useState(editByDefault)
  useWarnUnsavedChanges(editMode)

  return (
    <Page
      trackPageView={'dashboard slug page'}
      trackPageProps={{ slug: dashboard.slug, title: dashboard.title }}
      className="items-center"
    >
      <SEO
        title={dashboard.title}
        description={`dashboard created by ${dashboard.creatorName}`}
      />
      {dashboard.visibility === 'deleted' && (
        <>
          <Head>
            <meta name="robots" content="noindex, nofollow" />
          </Head>
          <div className="bg-error w-full rounded p-6 text-center text-lg text-white">
            Deleted by mods
          </div>
        </>
      )}

      <Col className="w-full max-w-3xl px-1 sm:px-2">
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
                {isOnlyMod && (
                  <Button
                    color="red"
                    className="ml-6"
                    onClick={() => setEditMode(true)}
                  >
                    Edit as Mod
                  </Button>
                )}
              </div>
            </Row>
          )}
        </div>
        {editMode ? (
          <Row className="bg-canvas-50 sticky top-0 z-20 mb-2 w-full items-center justify-end gap-2 self-start py-1">
            {isOnlyMod && (
              <Button
                color="red"
                className="mr-auto"
                onClick={() => {
                  deleteDashboard({ dashboardId: dashboard.id })
                  setEditMode(false)
                }}
              >
                Delete (mark as spam)
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
              disabled={!isValid}
              onClick={() => {
                updateDashboard({
                  dashboardId: dashboard.id,
                  title: dashboard.title,
                  items: dashboard.items,
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
          previews={previews}
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

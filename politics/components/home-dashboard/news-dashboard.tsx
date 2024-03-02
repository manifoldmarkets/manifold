'use client'
import clsx from 'clsx'
import {
  convertDashboardSqltoTS,
  Dashboard,
  DashboardItem,
  MAX_DASHBOARD_TITLE_LENGTH,
} from 'common/dashboard'
import { LinkPreviews } from 'common/link-preview'
import { useUser } from 'web/hooks/use-user'
import { useDashboardFromSlug } from 'web/hooks/use-dashboard'
import { useEffect, useState } from 'react'
import { isAdminId, isModId } from 'common/envs/constants'
import { useWarnUnsavedChanges } from 'web/hooks/use-warn-unsaved-changes'
import Head from 'next/head'
import { Col } from 'web/components/layout/col'
import { InputWithLimit } from 'web/components/dashboard/input-with-limit'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Button } from 'web/components/buttons/button'
import { deleteDashboard, updateDashboard } from 'web/lib/firebase/api'
import { AddItemCard } from 'web/components/dashboard/add-dashboard-item'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
import { usePathname, useRouter } from 'next/navigation'
import { type Contract } from 'common/contract'
import { ReferralSaver } from 'politics/components/referral-saver'

export function NewsDashboard(props: {
  initialDashboard: Dashboard
  previews: LinkPreviews
  initialContracts: Contract[]
  slug: string
  editByDefault: boolean
  className?: string
}) {
  const user = useUser()
  const router = useRouter()
  const pathName = usePathname() ?? ''

  const {
    initialDashboard,
    slug,
    editByDefault,
    previews,
    initialContracts,
    className,
  } = props
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

  const isCreator = dashboard.creatorId === user?.id
  const isOnlyMod =
    !isCreator && user && (isAdminId(user.id) || isModId(user.id))

  const [editMode, setEditMode] = useState(editByDefault)
  useWarnUnsavedChanges(editMode)

  return (
    <>
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
      <ReferralSaver />
      <Col className={clsx('w-full px-1 sm:px-2', className)} id={slug}>
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
                {/*<CopyLinkOrShareButton*/}
                {/*  url={`https://${ENV_CONFIG.domain}/news/${slug}${*/}
                {/*    user?.username ? referralQuery(user.username) : ''*/}
                {/*  }`}*/}
                {/*  eventTrackingName="copy dashboard link"*/}
                {/*  tooltip="Share"*/}
                {/*/>*/}

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
        {editMode && (
          <Row className="bg-canvas-50 sticky top-0 z-20 mb-2 w-full items-center justify-end gap-2 self-start py-1">
            {isOnlyMod && (
              <Button
                color="red"
                className="mr-auto"
                onClick={() => {
                  deleteDashboard({ dashboardId: dashboard.id })
                  setEditMode(false)
                  router.replace(pathName.split('?')[0])
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
                router.replace(pathName.split('?')[0])
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
                router.replace(pathName.split('?')[0])
              }}
            >
              Save
            </Button>
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
          key={dashboard.id} // make sure content re-renders when switching pages
          previews={previews}
          initialContracts={initialContracts}
          items={dashboard.items}
          setItems={updateItems}
          topics={dashboard.topics}
          setTopics={updateTopics}
          isEditing={editMode}
        />
      </Col>
    </>
  )
}

import { Page } from 'web/components/page'

import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { dashboardPath, getDashboardBySlug } from 'web/lib/firebase/dashboards'
import { Dashboard } from 'common/dashboard'
import { Title } from 'web/components/title'
import { Spacer } from 'web/components/layout/spacer'
import { Content } from 'web/components/editor'
import { UserLink } from 'web/components/user-page'
import { getUser, User } from 'web/lib/firebase/users'
import { ShareIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Button } from 'web/components/button'
import { useState } from 'react'
import { ShareDashboardModal } from 'web/components/share-dashboard-modal'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { ENV_CONFIG } from 'common/envs/constants'
import Custom404 from 'web/pages/404'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const dashboard = await getDashboardBySlug(slugs[0])
  const creatorPromise = dashboard ? getUser(dashboard.creatorId) : null
  const creator = await creatorPromise

  return {
    props: {
      dashboard: dashboard,
      creator: creator,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function DashboardPage(props: {
  dashboard: Dashboard
  creator: User
}) {
  props = usePropz(props, getStaticPropz) ?? {
    dashboard: null,
  }
  const [isShareOpen, setShareOpen] = useState(false)

  if (props.dashboard === null) {
    return <Custom404 />
  }

  const shareUrl = `https://${ENV_CONFIG.domain}${dashboardPath(
    props?.dashboard.slug
  )}`

  return (
    <Page>
      <div className="mx-auto w-full max-w-3xl ">
        <Spacer h={1} />
        <Title className="!mt-0" text={props.dashboard.name} />
        <Row>
          <Col className="flex-1">
            <div className={'inline-flex'}>
              <div className="mr-1 text-gray-500">Created by</div>
              <UserLink
                className="text-neutral"
                name={props.creator.name}
                username={props.creator.username}
              />
            </div>
          </Col>
          <Col>
            <Button
              size="lg"
              color="gray-white"
              className={'flex'}
              onClick={() => {
                setShareOpen(true)
              }}
            >
              <ShareIcon
                className={clsx('mr-2 h-[24px] w-5')}
                aria-hidden="true"
              />
              Share
              <ShareDashboardModal
                isOpen={isShareOpen}
                setOpen={setShareOpen}
                shareUrl={shareUrl}
              />
            </Button>
          </Col>
        </Row>

        <Spacer h={2} />
        <div className="rounded-lg bg-white px-6 py-4 sm:py-0">
          <div className="form-control w-full py-2">
            <Content content={props.dashboard.content} />
          </div>
        </div>
      </div>
    </Page>
  )
}

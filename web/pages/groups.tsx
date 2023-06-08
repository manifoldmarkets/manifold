import { FlagIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { groupPath } from 'common/group'
import { User } from 'common/user'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import DiscoverGroups from 'web/components/groups/discover-groups'
import YourGroups from 'web/components/groups/your-groups'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { SEO } from 'web/components/SEO'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'
import { useRealtimeMemberGroupIds } from 'web/hooks/use-group-supabase'
import { useUser } from 'web/hooks/use-user'

function PrivateGroupsBanner() {
  return (
    <Row className="dark:border-indigo-00 gap- mb-4 rounded bg-indigo-200 bg-opacity-70 px-2 py-1 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100">
      <span>
        <FlagIcon className="mt-0.5 h-5 w-5" />
      </span>
      <span>Private groups are now in beta! Create a private group today</span>
    </Row>
  )
}

export default function Groups() {
  const user = useUser()
  return (
    <Page>
    <SEO
        title="Groups"
        description="Topics and communities centered prediction markets."
        url="/groups"
      />
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-4 sm:px-2">
          <PrivateGroupsBanner />
          <Row className="items-start justify-between">
            <Title>Groups</Title>
            {user && (
              <CreateGroupButton
                user={user}
                goToGroupOnSubmit={true}
                className={'w-32 whitespace-nowrap'}
              />
            )}
          </Row>
          <GroupsPageContent user={user} />
        </Col>
      </Col>
    </Page>
  )
}

export function GroupsPageContent(props: { user: User | null | undefined }) {
  const { user } = props
  const yourGroupIds = useRealtimeMemberGroupIds(user)
  if (user === undefined || yourGroupIds === undefined) {
    return <LoadingIndicator />
  }
  if (user === null || (yourGroupIds && yourGroupIds.length < 1)) {
    return <DiscoverGroups yourGroupIds={yourGroupIds} />
  }

  return (
    <UncontrolledTabs
      className={'mb-4'}
      tabs={[
        {
          title: 'Your Groups',
          content: <YourGroups yourGroupIds={yourGroupIds} />,
        },
        {
          title: 'Discover',
          content: <DiscoverGroups yourGroupIds={yourGroupIds} />,
        },
      ]}
    />
  )
}

export function GroupLinkItem(props: {
  group: { slug: string; name: string }
  className?: string
}) {
  const { group, className } = props

  return (
    <SiteLink
      href={groupPath(group.slug)}
      className={clsx('z-10 truncate', className)}
    >
      {group.name}
    </SiteLink>
  )
}

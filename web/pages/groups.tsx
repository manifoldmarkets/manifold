import { LockClosedIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { groupPath } from 'common/group'
import { User } from 'common/user'
import Link from 'next/link'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import YourGroups from 'web/components/groups/your-groups'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useRealtimeMemberGroupIds } from 'web/hooks/use-group-supabase'
import { useUser } from 'web/hooks/use-user'
import GroupSearch from 'web/components/groups/group-search'

export default function Groups() {
  const user = useUser()
  return (
    <Page>
      <SEO
        title="Categories"
        description="Categories of questions."
        url="/groups"
      />
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-4 sm:px-2">
          <Row className="mt-1 mb-3 items-start justify-between">
            <span className={'text-primary-600 text-2xl'}>Categories</span>
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
  const yourGroupIds = useRealtimeMemberGroupIds(user?.id)
  if (user === undefined || yourGroupIds === undefined) {
    return <LoadingIndicator />
  }
  if (user === null || (yourGroupIds && yourGroupIds.length < 1)) {
    return (
      <GroupSearch
        persistPrefix={'discover-groups'}
        yourGroupIds={yourGroupIds}
      />
    )
  }

  return <YourGroups yourGroupIds={yourGroupIds} />
}

export function GroupTag(props: {
  group: { slug: string; name: string }
  isPrivate?: boolean
  className?: string
  children?: React.ReactNode // end element - usually for a remove button
}) {
  const { group, isPrivate, className, children } = props

  return (
    <div
      className={clsx(
        'group flex w-fit min-w-0 max-w-[200px] shrink-0 truncate whitespace-nowrap rounded-sm px-1 py-0.5 text-sm transition-colors sm:max-w-[250px]',
        isPrivate
          ? 'text-ink-1000 bg-primary-100 hover:bg-primary-200'
          : 'text-primary-700 hover:bg-primary-400/20',
        className
      )}
    >
      <Link
        prefetch={false}
        href={groupPath(group.slug)}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        {isPrivate ? (
          <LockClosedIcon className="my-auto mr-0.5 h-3 w-3" />
        ) : (
          <span className="text-primary-700/50 mr-px transition-colors group-hover:text-inherit">
            #
          </span>
        )}
        {group.name}
      </Link>
      {children}
    </div>
  )
}

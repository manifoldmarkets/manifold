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
import { useUser } from 'web/hooks/use-user'
import GroupSearch from 'web/components/groups/group-search'
import { useMemberGroupIds } from 'web/hooks/use-group-supabase'
import { useTracking } from 'web/hooks/use-tracking'

export default function Groups() {
  const user = useUser()
  useTracking('view groups')

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
  const yourGroupIds = useMemberGroupIds(user?.id)
  if (user === undefined || yourGroupIds === undefined) {
    return <LoadingIndicator />
  }
  if (user === null) {
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
        'group flex w-fit min-w-0 shrink-0 whitespace-nowrap rounded-sm px-1 py-0.5 text-sm transition-colors',
        'text-ink-500 dark:text-ink-400 hover:text-ink-600 hover:bg-primary-400/10 rounded',
        className
      )}
    >
      <Link
        prefetch={false}
        href={groupPath(group.slug)}
        onClick={(e) => {
          e.stopPropagation()
        }}
        className={' max-w-[200px] truncate sm:max-w-[250px]'}
      >
        {isPrivate ? (
          <LockClosedIcon className="my-auto mr-0.5 h-3 w-3" />
        ) : (
          <span className="mr-px opacity-50 transition-colors group-hover:text-inherit">
            #
          </span>
        )}
        {group.name}
      </Link>
      {children}
    </div>
  )
}

import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'
import { TopicDropdown } from 'web/components/topics/topic-dropdown'
import { LiteGroup } from 'common/group'
import { usePrivateUser, useUser } from 'web/hooks/use-user'

export function TopicsList(props: {
  topics: LiteGroup[]
  loadMore?: () => Promise<boolean>
  currentTopicSlug?: string
  setCurrentTopicSlug: (slug: string) => void
  className?: string
}) {
  const { currentTopicSlug, setCurrentTopicSlug, className } = props

  const user = useUser()
  const privateUser = usePrivateUser()

  const topics = props.topics.filter(
    (g) => !privateUser?.blockedGroupSlugs.includes(g.slug)
  )

  return (
    <div
      className={clsx(
        className,
        'scrollbar-hide bg-canvas-50 sticky right-0 top-0 z-20 max-h-screen overflow-y-auto px-2'
      )}
    >
      <Row
        className={
          'bg-canvas-50 sticky top-0 z-10 w-full items-center justify-center'
        }
      >
        <div className="text-primary-700 flex w-full items-center justify-between px-2 pb-2">
          Topics
          {user && (
            <TopicDropdown
              setCurrentTopic={setCurrentTopicSlug}
              user={user}
              className="mr-1"
            />
          )}
        </div>
      </Row>
      {user && (
        <>
          <SidebarItem
            key={'all-questions'}
            slug={''}
            name={'🌎 All questions'}
            currentTopicSlug={currentTopicSlug}
            setCurrentTopicSlug={setCurrentTopicSlug}
          />
          <SidebarItem
            key={'sidebar-for-you'}
            slug={'for-you'}
            name={'⭐️ For you'}
            currentTopicSlug={currentTopicSlug}
            setCurrentTopicSlug={setCurrentTopicSlug}
          />
        </>
      )}
      {topics.length > 0 &&
        topics.map((group) => (
          <SidebarItem
            key={group.id}
            slug={group.slug}
            name={group.name}
            currentTopicSlug={currentTopicSlug}
            setCurrentTopicSlug={setCurrentTopicSlug}
          />
        ))}
    </div>
  )
}

const SidebarItem = (props: {
  slug: string
  name: string
  currentTopicSlug: string | undefined
  setCurrentTopicSlug: (slug: string) => void
}) => {
  const { slug, name, currentTopicSlug, setCurrentTopicSlug } = props

  return (
    <Row
      className={clsx(
        'w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-2',
        currentTopicSlug == slug
          ? 'bg-ink-200 text-ink-900 font-semibold'
          : 'text-ink-600 hover:bg-primary-100'
      )}
      onClick={() => {
        if (currentTopicSlug !== slug) track('select topics item', { slug })
        setCurrentTopicSlug(currentTopicSlug === slug ? '' : slug)
      }}
    >
      {name}
    </Row>
  )
}

import { Col } from '../layout/col'
import { Group } from 'common/group'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { PrivateUser, User } from 'common/user'
import { useRealtimeMemberGroups } from 'web/hooks/use-group-supabase'
import { Button } from 'web/components/buttons/button'
import { MdOutlineKeyboardDoubleArrowRight } from 'react-icons/md'
import { track } from 'web/lib/service/analytics'
import { TopicOptionsButton } from 'web/components/topics/topics-button'
import { ForYouDropdown } from 'web/components/topics/for-you-dropdown'
import { ReactNode } from 'react'

const ROW_CLASS =
  'group relative w-full cursor-pointer items-center rounded-md py-4 px-2'
export function TopicsList(props: {
  topics: Group[]
  loadMore?: () => Promise<boolean>
  currentTopicSlug?: string
  setCurrentTopicSlug: (slug: string) => void
  privateUser: PrivateUser | null | undefined
  user: User | null | undefined
  show: boolean
  setShow: (show: boolean) => void
  className?: string
}) {
  const {
    currentTopicSlug,
    privateUser,
    user,
    setCurrentTopicSlug,
    show,
    setShow,
    className,
  } = props
  const topics = props.topics.filter(
    (g) => !privateUser?.blockedGroupSlugs.includes(g.slug)
  )
  const yourGroups = useRealtimeMemberGroups(user?.id)

  return (
    <Col
      className={clsx(
        show
          ? 'animate-slide-in-from-right block lg:animate-none'
          : 'hidden lg:flex',
        className,
        'scrollbar-hide sticky top-0 right-0 max-h-screen overflow-y-auto sm:max-w-min lg:max-w-none',
        currentTopicSlug == 'for-you' ? '' : 'lg:rounded-t-md'
      )}
    >
      <Row
        className={
          'bg-canvas-50 sticky top-0 z-10 w-full items-center justify-center'
        }
      >
        <div className="text-primary-700 hidden w-full pb-2 pl-2 lg:block">
          Topics
        </div>
        <Button
          className={clsx('h-[3.15rem] w-full lg:hidden')}
          color={'gray-white'}
          size={'md'}
          onClick={() => setShow(!show)}
        >
          <MdOutlineKeyboardDoubleArrowRight className="mr-1 h-5 w-5" />
          Topics
        </Button>
      </Row>
      {user && (
        <SidebarItem
          key={'all-questions'}
          slug={''}
          name={'🌎 All questions'}
          currentTopicSlug={currentTopicSlug}
          setCurrentTopicSlug={setCurrentTopicSlug}
          optionsItem={<></>}
        />
      )}
      {user && (
        <SidebarItem
          key={'sidebar-for-you'}
          slug={'for-you'}
          name={'⭐️ For you'}
          currentTopicSlug={currentTopicSlug}
          setCurrentTopicSlug={setCurrentTopicSlug}
          optionsItem={
            <ForYouDropdown
              setCurrentTopic={setCurrentTopicSlug}
              user={user}
              yourGroups={yourGroups}
              className={clsx(
                'mr-1',
                currentTopicSlug !== 'for-you'
                  ? 'opacity-0 group-hover:opacity-100'
                  : 'opacity-100'
              )}
            />
          }
        />
      )}
      {topics.length > 0 &&
        topics.map((group) => (
          <SidebarItem
            key={group.id}
            slug={group.slug}
            name={group.name}
            currentTopicSlug={currentTopicSlug}
            setCurrentTopicSlug={setCurrentTopicSlug}
            optionsItem={
              <TopicOptionsButton
                key={group.id}
                group={group}
                yourGroupIds={yourGroups?.map((g) => g.id)}
                user={user}
                className={'mr-1'}
                selected={currentTopicSlug == group.slug}
              />
            }
          />
        ))}
    </Col>
  )
}
const SidebarItem = (props: {
  slug: string
  name: string
  currentTopicSlug: string | undefined
  setCurrentTopicSlug: (slug: string) => void
  optionsItem: ReactNode
}) => {
  const { slug, name, currentTopicSlug, setCurrentTopicSlug, optionsItem } =
    props

  return (
    <Row
      className={clsx(
        ROW_CLASS,
        currentTopicSlug == slug
          ? 'bg-ink-200 text-ink-900'
          : 'text-ink-600 hover:bg-primary-100'
      )}
      onClick={() => {
        if (currentTopicSlug !== slug) track('select topics item', { slug })
        setCurrentTopicSlug(currentTopicSlug === slug ? '' : slug)
      }}
    >
      <span
        className={clsx(
          ' flex w-full flex-row text-left text-sm',
          currentTopicSlug == slug ? 'font-semibold' : ''
        )}
      >
        {name}
      </span>
      {optionsItem}
    </Row>
  )
}

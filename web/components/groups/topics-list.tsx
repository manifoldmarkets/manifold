import { Col } from '../layout/col'
import { Group } from 'common/group'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { PrivateUser, User } from 'common/user'
import {
  useMemberGroupIdsOnLoad,
  useRealtimeMemberGroups,
} from 'web/hooks/use-group-supabase'
import { Button } from 'web/components/buttons/button'
import { MdOutlineKeyboardDoubleArrowRight } from 'react-icons/md'
import { track } from 'web/lib/service/analytics'
import { GroupOptionsButton } from 'web/components/groups/groups-button'
import { ForYouDropdown } from 'web/components/groups/for-you-dropdown'

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
  const yourGroupIdsInMemory = useMemberGroupIdsOnLoad(user?.id)
  const yourGroupIds = yourGroups?.map((g) => g.id) ?? yourGroupIdsInMemory
  const widthClasses =
    'xl:min-w-64 min-w-[7rem] sm:min-w-[8rem] md:min-w-[10.5rem]'
  return (
    <Col
      className={clsx(
        show ? 'animate-slide-in-from-right block xl:animate-none' : 'hidden',
        className,
        'scrollbar-hide sticky top-0 right-10 max-h-screen overflow-y-auto sm:max-w-min xl:max-w-none',
        'bg-canvas-0 items-start',
        currentTopicSlug == 'for-you' ? '' : 'xl:rounded-t-md '
      )}
    >
      <Row
        className={
          'bg-canvas-0 sticky top-0 z-10 w-full items-center justify-center xl:hidden'
        }
      >
        <Button
          className={clsx('h-[3.15rem]', widthClasses)}
          color={'gray-white'}
          size={'md'}
          onClick={() => setShow(!show)}
        >
          <MdOutlineKeyboardDoubleArrowRight className="mr-1 h-5 w-5" />
          Topics
        </Button>
      </Row>
      {user && privateUser && (
        <ForYouButton
          setCurrentCategory={setCurrentTopicSlug}
          currentCategorySlug={currentTopicSlug}
          user={user}
          yourGroups={yourGroups}
        />
      )}
      {topics.length > 0 &&
        topics.map((group) => (
          <Row
            className={clsx(
              'hover:bg-canvas-50 group relative w-full cursor-pointer items-center py-4 px-2',
              currentTopicSlug == group.slug ? 'bg-canvas-50' : ''
            )}
            onClick={() => {
              if (currentTopicSlug !== group.slug) track('select sidebar topic')
              setCurrentTopicSlug(
                currentTopicSlug === group.slug ? '' : group.slug
              )
            }}
            key={group.id}
          >
            <div
              className={currentTopicSlug == group.slug ? selectedBarClass : ''}
            />
            <span
              className={clsx(
                ' flex w-full flex-row text-left text-sm',
                currentTopicSlug == group.slug
                  ? 'bg-canvas-50 font-semibold'
                  : ''
              )}
            >
              {group.name}
            </span>
            <GroupOptionsButton
              key={group.id}
              group={group}
              yourGroupIds={yourGroupIds}
              user={user}
              className={'mr-1'}
            />
          </Row>
        ))}
    </Col>
  )
}
export const selectedBarClass =
  'bg-primary-300 absolute right-0 top-0 h-full w-1.5'

const ForYouButton = (props: {
  currentCategorySlug?: string
  setCurrentCategory: (categorySlug: string) => void
  user: User
  yourGroups: Group[] | undefined
}) => {
  const { currentCategorySlug, yourGroups, user, setCurrentCategory } = props

  return (
    <Row
      className={clsx(
        'hover:bg-canvas-50 relative w-full  cursor-pointer px-2 py-4',
        currentCategorySlug == 'for-you' ? 'bg-canvas-50' : ''
      )}
      onClick={() =>
        setCurrentCategory(currentCategorySlug === 'for-you' ? '' : 'for-you')
      }
    >
      <div
        className={currentCategorySlug == 'for-you' ? selectedBarClass : ''}
      />
      <span
        className={clsx(
          'w-full flex-row flex-wrap text-left text-sm ',
          currentCategorySlug == 'for-you' ? ' font-semibold ' : ''
        )}
      >
        ⭐️ For you
      </span>
      <ForYouDropdown
        setCurrentCategory={setCurrentCategory}
        user={user}
        yourGroups={yourGroups}
        className={'mr-1'}
      />
    </Row>
  )
}

import { Col } from '../layout/col'
import { Group } from 'common/group'
import { useState } from 'react'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { PrivateUser, User } from 'common/user'
import {
  useListGroupsBySlug,
  useMemberGroupIdsOnLoad,
  useRealtimeMemberGroups,
} from 'web/hooks/use-group-supabase'
import { buildArray } from 'common/util/array'
import { MinusCircleIcon, PlusCircleIcon } from '@heroicons/react/solid'
import { CogIcon, PencilIcon } from '@heroicons/react/outline'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/comments/dropdown-menu'
import { Button } from 'web/components/buttons/button'
import { MdOutlineKeyboardDoubleArrowRight } from 'react-icons/md'
import { track } from 'web/lib/service/analytics'
import { joinGroup } from 'web/lib/firebase/api'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { leaveGroup } from 'web/lib/supabase/groups'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Modal, SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { GroupSelector } from 'web/components/groups/group-selector'
import { CreateGroupModal } from 'web/components/groups/create-group-modal'
import { HiNoSymbol } from 'react-icons/hi2'
import { BsFillPersonDashFill } from 'react-icons/bs'
import { GroupOptionsButton } from 'web/components/groups/groups-button'

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
  return (
    <Row
      className={clsx(
        show ? 'animate-slide-in-from-right block xl:animate-none' : 'hidden',
        className
      )}
    >
      <Col
        className={clsx(
          'scrollbar-hide relative max-h-[calc(100vh-4rem)] min-h-[35rem] overflow-y-auto overflow-x-visible lg:max-h-[calc(100vh-6rem)]',
          'bg-canvas-0 h-fit w-[7rem] items-start sm:w-[8rem] md:w-[10rem] xl:w-64 ',
          currentTopicSlug == 'for-you' ? '' : 'xl:rounded-t-md '
        )}
      >
        <Row
          className={
            'bg-canvas-0 sticky top-0 z-10 w-full items-center justify-center xl:hidden'
          }
        >
          <Button
            className={'h-[3.15rem] w-[8rem] md:w-[10.5rem]'}
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
            privateUser={privateUser}
            currentCategorySlug={currentTopicSlug}
            user={user}
            yourGroups={yourGroups}
          />
        )}
        {topics.length > 0 &&
          topics.map((group) => (
            <Row
              className={clsx(
                'group relative w-full items-center',
                currentTopicSlug == group.slug ? 'bg-canvas-50' : ''
              )}
              key={group.id}
            >
              <button
                onClick={() => {
                  if (currentTopicSlug !== group.slug)
                    track('select sidebar topic')
                  setCurrentTopicSlug(
                    currentTopicSlug === group.slug ? '' : group.slug
                  )
                }}
                className={clsx(
                  'hover:bg-canvas-50 flex w-full flex-row py-4 px-2 text-left text-sm',
                  currentTopicSlug == group.slug
                    ? 'bg-canvas-50 font-semibold'
                    : ''
                )}
              >
                <div
                  className={
                    currentTopicSlug == group.slug ? selectedBarClass : ''
                  }
                />
                <span>{group.name}</span>
              </button>
              <GroupOptionsButton
                key={group.id}
                group={group}
                yourGroupIds={yourGroupIds}
                user={user}
              />
            </Row>
          ))}
      </Col>
    </Row>
  )
}
export const selectedBarClass =
  'bg-primary-300 absolute right-0 top-0 h-full w-1.5'

const ForYouButton = (props: {
  currentCategorySlug?: string
  setCurrentCategory: (categorySlug: string) => void
  privateUser: PrivateUser
  user: User
  yourGroups: Group[] | undefined
}) => {
  const {
    currentCategorySlug,
    yourGroups,
    user,
    setCurrentCategory,
    privateUser,
  } = props
  const [showEditingBlockedTopics, setShowEditingBlockedTopics] =
    useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showFollowedTopics, setShowFollowedTopics] = useState(false)
  const groupOptionItems = buildArray(
    {
      name: 'Create new topic',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: () => setShowCreateGroup(true),
    },
    {
      name: 'Followed topics',
      icon: <PencilIcon className="h-5 w-5" />,
      onClick: () => setShowFollowedTopics(true),
    },
    {
      name: 'Blocked topics',
      icon: <HiNoSymbol className="h-5 w-5" />,
      onClick: () => setShowEditingBlockedTopics(true),
    }
  ) as DropdownItem[]
  return (
    <Row className={' w-full'}>
      <button
        onClick={() =>
          setCurrentCategory(currentCategorySlug === 'for-you' ? '' : 'for-you')
        }
        className={clsx(
          'hover:bg-canvas-50 relative w-full flex-row flex-wrap px-2 py-4 text-left text-sm ',
          currentCategorySlug == 'for-you' ? 'bg-canvas-50 font-semibold ' : ''
        )}
      >
        <div
          className={currentCategorySlug == 'for-you' ? selectedBarClass : ''}
        />
        <Row className={'items-center justify-between'}>
          <span>⭐️ For you</span>
          <DropdownMenu
            Items={groupOptionItems}
            Icon={<CogIcon className=" text-ink-600 h-5 w-5" />}
            menuWidth={'w-60'}
            withinOverflowContainer={true}
          />
        </Row>
      </button>
      {showCreateGroup && (
        <CreateGroupModal
          user={user}
          open={showCreateGroup}
          setOpen={setShowCreateGroup}
          goToGroupOnSubmit={true}
        />
      )}
      {privateUser && showEditingBlockedTopics && (
        <BlockedTopicsModal
          privateUser={privateUser}
          setShowEditingBlockedTopics={setShowEditingBlockedTopics}
          show={showEditingBlockedTopics}
        />
      )}
      {showFollowedTopics && user && (
        <FollowedTopicsModal
          user={user}
          setShow={setShowFollowedTopics}
          show={showFollowedTopics}
          setCurrentCategory={setCurrentCategory}
          groups={yourGroups}
        />
      )}
    </Row>
  )
}

const BlockedTopicsModal = (props: {
  privateUser: PrivateUser
  setShowEditingBlockedTopics: (show: boolean) => void
  show: boolean
}) => {
  const { privateUser, show, setShowEditingBlockedTopics } = props
  const groups = useListGroupsBySlug(privateUser.blockedGroupSlugs ?? [])
  const unBlockGroup = async (groupSlug: string) => {
    await updatePrivateUser(privateUser.id, {
      blockedGroupSlugs:
        privateUser.blockedGroupSlugs?.filter((id) => id !== groupSlug) ?? [],
    })
  }
  const blockGroup = async (groupSlug: string) => {
    await updatePrivateUser(privateUser.id, {
      blockedGroupSlugs: [...(privateUser.blockedGroupSlugs ?? []), groupSlug],
    })
  }

  return (
    <Modal
      open={show}
      setOpen={setShowEditingBlockedTopics}
      className={SCROLLABLE_MODAL_CLASS}
    >
      <Col className={'bg-canvas-50 min-h-[25rem] rounded-md p-4'}>
        {groups?.length ? (
          <span className={'text-primary-700 text-lg'}>Blocked Topics</span>
        ) : null}
        {(groups ?? []).map((group) => (
          <Row
            key={group.id}
            className={'mt-2 w-full items-center justify-between'}
          >
            <span>{group.name}</span>
            <Button
              size={'xs'}
              color={'gray'}
              onClick={() => unBlockGroup(group.slug)}
            >
              <MinusCircleIcon className="h-5 w-5" />
            </Button>
          </Row>
        ))}
        <span className={'text-primary-700 mt-2 text-lg'}>
          Block more topics
        </span>
        <GroupSelector setSelectedGroup={(group) => blockGroup(group.slug)} />
        <div className={'mb-[10rem]'} />
      </Col>
    </Modal>
  )
}
const FollowedTopicsModal = (props: {
  user: User
  setShow: (show: boolean) => void
  show: boolean
  setCurrentCategory: (categorySlug: string) => void
  groups: Group[] | undefined
}) => {
  const { user, show, groups, setCurrentCategory, setShow } = props

  return (
    <Modal open={show} setOpen={setShow} className={SCROLLABLE_MODAL_CLASS}>
      <Col className={clsx('bg-canvas-50 min-h-[25rem] rounded-md p-4')}>
        <span className={'text-primary-700 text-lg'}>Followed Topics</span>

        {!groups ? (
          <LoadingIndicator />
        ) : (
          groups.map((group) => (
            <Row
              key={group.id + 'followed-topic'}
              className={'mt-2 w-full items-center justify-between'}
            >
              <button
                onClick={() => {
                  setCurrentCategory(group.slug)
                  setShow(false)
                }}
              >
                {group.name}
              </button>
              <Button
                size={'xs'}
                color={'gray'}
                onClick={() => {
                  console.log('leave group', group.id, user.id)
                  leaveGroup(group.id, user.id)
                  track('leave group', { slug: group.slug })
                }}
              >
                <BsFillPersonDashFill className="h-5 w-5" />
              </Button>
            </Row>
          ))
        )}
        <span className={'text-primary-700 mt-2 text-lg'}>
          Follow more topics
        </span>
        <GroupSelector
          setSelectedGroup={(group) => {
            joinGroup({ groupId: group.id })
            track('join group', { slug: group.slug })
          }}
          ignoreGroupIds={groups?.map((g) => g.id)}
        />
        <div className={'mb-[10rem]'} />
      </Col>
    </Modal>
  )
}

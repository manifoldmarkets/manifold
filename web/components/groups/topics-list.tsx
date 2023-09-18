import { Col } from '../layout/col'
import { Group } from 'common/group'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { PrivateUser, User } from 'common/user'
import { removeEmojis } from 'common/topics'
import { useAdmin } from 'web/hooks/use-admin'
import {
  useListGroupsBySlug,
  useRealtimeRole,
} from 'web/hooks/use-group-supabase'
import { buildArray } from 'common/util/array'
import {
  MinusCircleIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import { CogIcon } from '@heroicons/react/outline'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/comments/dropdown-menu'
import { Button } from 'web/components/buttons/button'
import { MdOutlineKeyboardDoubleArrowRight } from 'react-icons/md'
import { track, withTracking } from 'web/lib/service/analytics'
import { joinGroup } from 'web/lib/firebase/api'
import toast from 'react-hot-toast'
import { firebaseLogin, updatePrivateUser } from 'web/lib/firebase/users'
import { leaveGroup } from 'web/lib/supabase/groups'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Modal } from 'web/components/layout/modal'
import { GroupSelector } from 'web/components/groups/group-selector'
import { CreateGroupModal } from 'web/components/groups/create-group-modal'
import { GroupOptions } from 'web/components/groups/group-options'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export function TopicsList(props: {
  topics: Group[]
  loadMore?: () => Promise<boolean>
  currentTopicSlug?: string
  setCurrentTopicSlug: (slug: string) => void
  privateUser: PrivateUser | null | undefined
  user: User | null | undefined
  yourGroupIds?: string[]
  show: boolean
  setShow: (show: boolean) => void
  className?: string
}) {
  const {
    topics,
    currentTopicSlug,
    yourGroupIds,
    privateUser,
    user,
    setCurrentTopicSlug,
    show,
    setShow,
    className,
  } = props
  return (
    <Row
      className={clsx(
        show ? 'animate-slide-in-from-right block' : 'hidden',
        className
      )}
    >
      <Col
        className={clsx(
          'scrollbar-hide  max-h-[calc(100vh-4rem)] min-h-[35rem] overflow-y-auto overflow-x-visible lg:max-h-[calc(100vh-6rem)]',
          'bg-canvas-0 h-fit w-[7rem] items-start sm:w-[8rem] md:w-[10rem]'
        )}
      >
        <Row className={'w-full items-center justify-center xl:hidden'}>
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
          />
        )}
        {topics.length > 0 &&
          topics.map((group) => (
            <GroupButton
              key={group.id}
              group={group}
              yourGroupIds={yourGroupIds}
              user={user}
              currentCategorySlug={currentTopicSlug}
              setCurrentCategory={setCurrentTopicSlug}
            />
          ))}
      </Col>
    </Row>
  )
}

export const ForYouButton = (props: {
  currentCategorySlug?: string
  setCurrentCategory: (categoryId: string) => void
  privateUser: PrivateUser
  user: User
}) => {
  const { currentCategorySlug, user, setCurrentCategory, privateUser } = props
  const [showEditingBlockedTopics, setShowEditingBlockedTopics] =
    useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const groupOptionItems = buildArray(
    {
      name: 'Create a new topic',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: () => setShowCreateGroup(true),
    },
    {
      name: 'Edit blocked topics',
      icon: <PencilIcon className="h-5 w-5" />,
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
          currentCategorySlug == 'for-you' ? 'bg-primary-50 ' : ''
        )}
      >
        <div
          className={
            currentCategorySlug == 'for-you'
              ? 'bg-primary-300 absolute right-0 top-0 h-full w-1.5'
              : ''
          }
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
      <CreateGroupModal
        user={user}
        open={showCreateGroup}
        setOpen={setShowCreateGroup}
        goToGroupOnSubmit={true}
      />
      {privateUser && (
        <BlockedTopicsModal
          privateUser={privateUser}
          setShowEditingBlockedTopics={setShowEditingBlockedTopics}
          show={showEditingBlockedTopics}
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
    <Modal open={show} setOpen={setShowEditingBlockedTopics}>
      <Col className={'bg-canvas-50 min-h-[25rem] rounded-md p-4'}>
        <span className={'text-lg font-bold'}>Blocked Topics</span>
        {(groups ?? []).map((group) => (
          <Row
            key={group.id}
            className={'mt-2 w-full items-center justify-between'}
          >
            <span>{group.name}</span>
            <button onClick={() => unBlockGroup(group.slug)}>
              <MinusCircleIcon className="h-5 w-5" />
            </button>
          </Row>
        ))}
        <GroupSelector
          setSelectedGroup={(group) => blockGroup(group.slug)}
          isContractCreator={false}
        />
      </Col>
    </Modal>
  )
}
export const GroupButton = (props: {
  group: Group
  yourGroupIds?: string[]
  user: User | null | undefined
  currentCategorySlug?: string
  setCurrentCategory: (categoryId: string) => void
}) => {
  const { group, yourGroupIds, user, setCurrentCategory, currentCategorySlug } =
    props
  const isCreator = user?.id == group.creatorId
  const isManifoldAdmin = useAdmin()
  const realtimeRole = useRealtimeRole(group?.id)
  const userRole = isManifoldAdmin ? 'admin' : realtimeRole
  const [isMember, setIsMember] = useState(false)
  useEffect(() => {
    setIsMember((yourGroupIds ?? []).includes(group.id))
  }, [yourGroupIds?.length])
  const [loading, setLoading] = useState(false)
  const isMobile = useIsMobile()
  const isPrivate = group.privacyStatus == 'private'
  const follow = user
    ? withTracking(
        () => {
          setLoading(true)
          joinGroup({ groupId: group.id })
            .then(() => {
              setIsMember(true)
              toast(`You're now following ${group.name}!`)
            })
            .catch((e) => {
              console.error(e)
              toast.error('Failed to follow category')
            })
            .finally(() => setLoading(false))
        },
        'join group',
        { slug: group.slug }
      )
    : firebaseLogin
  const unfollow = user
    ? withTracking(
        () => {
          leaveGroup(group.id, user.id)
            .then(() => {
              setIsMember(false)
              toast(`You're not longer following ${group.name}.`)
            })
            .catch(() => {
              toast.error('Failed to unfollow category')
            })
        },
        'leave group',
        { slug: group.slug }
      )
    : firebaseLogin
  return (
    <button
      onClick={() => {
        if (currentCategorySlug !== group.slug) track('select sidebar topic')
        setCurrentCategory(currentCategorySlug === group.slug ? '' : group.slug)
      }}
      className={clsx(
        'hover:bg-canvas-50 relative my-2 w-full flex-row flex-wrap px-2 py-4 text-left text-sm ',
        currentCategorySlug == group.slug ? 'bg-primary-50 ' : ''
      )}
      key={group.id}
    >
      <div
        className={
          currentCategorySlug == group.slug
            ? 'bg-primary-300 absolute right-0 top-0 h-full w-1.5'
            : ''
        }
      />
      <Row className={'w-full items-center justify-between'}>
        <span>{isMobile ? removeEmojis(group.name) : group.name}</span>
        {!isPrivate && !isCreator && !isMember && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              follow()
            }}
          >
            {loading ? (
              <LoadingIndicator size={'sm'} />
            ) : (
              <PlusCircleIcon className=" hover:text-primary-500 h-5 w-5" />
            )}
          </button>
        )}
        {(isCreator || isMember) && (
          <GroupOptions
            group={group}
            user={user}
            canEdit={userRole === 'admin'}
            isMember={isMember}
            unfollow={unfollow}
          />
        )}
      </Row>
    </button>
  )
}

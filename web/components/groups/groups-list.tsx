import { Col } from '../layout/col'
import { CATEGORY_KEY, Group, PrivacyStatusType } from 'common/group'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { BETTORS, PrivateUser, User } from 'common/user'
import { removeEmojis } from 'common/topics'
import { useAdmin } from 'web/hooks/use-admin'
import {
  useListGroupsBySlug,
  useRealtimeRole,
} from 'web/hooks/use-group-supabase'
import { buildArray } from 'common/util/array'
import {
  DotsVerticalIcon,
  MinusCircleIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import { CogIcon, LinkIcon } from '@heroicons/react/outline'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/comments/dropdown-menu'
import { Button } from 'web/components/buttons/button'
import { MdOutlineKeyboardDoubleArrowRight } from 'react-icons/md'
import { withTracking } from 'web/lib/service/analytics'
import { joinGroup } from 'web/lib/firebase/api'
import toast from 'react-hot-toast'
import { firebaseLogin, updatePrivateUser } from 'web/lib/firebase/users'
import { leaveGroup } from 'web/lib/supabase/groups'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Modal } from 'web/components/layout/modal'
import { GroupSelector } from 'web/components/groups/group-selector'
import { EditableGroupTitle } from 'web/components/groups/editable-group-name'
import router from 'next/router'
import { CreateGroupModal } from 'web/components/groups/create-group-modal'
import { getUsers } from 'web/lib/supabase/user'
import { GroupLeaderboard } from 'web/components/groups/group-leaderboard'
import { AiOutlineTrophy } from 'react-icons/ai'
import { copyToClipboard } from 'web/lib/util/copy'
import { DOMAIN } from 'common/envs/constants'
import { GroupRole } from 'web/components/groups/group-member-modal'
import {
  AddContractToGroupModal,
  AddContractToGroupPermissionType,
} from 'web/components/groups/add-contract-to-group-button'
export function GroupsList(props: {
  groups: Group[]
  loadMore?: () => Promise<boolean>
  currentCategorySlug?: string
  setCurrentCategory: (categoryId: string) => void
  privateUser: PrivateUser | null | undefined
  user: User | null | undefined
  yourGroupIds?: string[]
  show: boolean
  setShow: (show: boolean) => void
}) {
  const {
    groups,
    currentCategorySlug,
    yourGroupIds,
    privateUser,
    user,
    setCurrentCategory,
    show,
    setShow,
  } = props
  return (
    <Row
      className={clsx(show ? 'animate-slide-in-from-right block' : 'hidden')}
    >
      <Col
        className={clsx(
          'scrollbar-hide  max-h-[calc(100vh-4rem)] min-h-[35rem] overflow-y-auto overflow-x-visible lg:max-h-[calc(100vh-6rem)]',
          'bg-canvas-0 h-fit w-[7rem] items-start gap-2 sm:w-[8rem] md:w-[10rem]'
        )}
      >
        <Row className={'w-full items-center justify-center'}>
          <Button
            className={'mt-0.5 h-12 w-full'}
            color={'gray-white'}
            size={'md'}
            onClick={() => setShow(!show)}
          >
            Topics
            <MdOutlineKeyboardDoubleArrowRight className="ml-1 h-5 w-5" />
          </Button>
        </Row>
        {user && privateUser && (
          <ForYouButton
            setCurrentCategory={setCurrentCategory}
            privateUser={privateUser}
            currentCategorySlug={currentCategorySlug}
            user={user}
          />
        )}
        {groups.length > 0 &&
          groups.map((group) => (
            <GroupButton
              key={group.id}
              group={group}
              yourGroupIds={yourGroupIds}
              user={user}
              currentCategorySlug={currentCategorySlug}
              setCurrentCategory={setCurrentCategory}
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
    <Row className={'w-full'}>
      <button
        onClick={() => setCurrentCategory('for-you')}
        className={clsx(
          'relative w-full flex-row flex-wrap px-2 py-4 text-left text-sm ',
          currentCategorySlug == 'for-you' ? 'bg-canvas-50 ' : ''
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
          <span>For you</span>
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

  const isPrivate = group.privacyStatus == 'private'
  const follow = user
    ? withTracking(() => {
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
      }, 'join group')
    : firebaseLogin
  const unfollow = user
    ? withTracking(() => {
        leaveGroup(group.id, user.id)
          .then(() => setIsMember(false))
          .catch(() => {
            toast.error('Failed to unfollow category')
          })
      }, 'leave group')
    : firebaseLogin
  return (
    <button
      onClick={() => setCurrentCategory(group.slug)}
      className={clsx(
        'relative w-full flex-row flex-wrap px-2 py-4 text-left text-sm ',
        currentCategorySlug == group.slug ? 'bg-canvas-50 ' : ''
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
        <span>{removeEmojis(group.name)}</span>
        {!isPrivate && !isCreator && !isMember && (
          <button onClick={follow}>
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

function GroupOptions(props: {
  group: Group
  user: User | null | undefined
  canEdit: boolean
  isMember: boolean
  unfollow: () => void
}) {
  const { group, canEdit, user, isMember, unfollow } = props
  const [editingName, setEditingName] = useState(false)
  const [showLeaderboards, setShowLeaderboards] = useState(false)
  const [showAddContract, setShowAddContract] = useState(false)
  const realtimeRole = useRealtimeRole(group?.id)
  const isManifoldAdmin = useAdmin()
  const isCreator = group.creatorId == user?.id
  const userRole = isManifoldAdmin ? 'admin' : realtimeRole
  const addPermission = getAddContractToGroupPermission(
    group.privacyStatus,
    userRole,
    isCreator
  )

  const groupOptionItems = buildArray(
    {
      name: 'Share topic',
      icon: <LinkIcon className="h-5 w-5" />,
      onClick: () => {
        copyToClipboard(
          `https://${DOMAIN}/questions/${CATEGORY_KEY}=${group.slug}`
        )
        toast.success('Link copied!')
      },
    },
    addPermission != 'none' && {
      name: 'Add questions to topic',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: () => setShowAddContract(true),
    },
    isMember &&
      !isCreator && {
        name: 'Unfollow topic',
        icon: <MinusCircleIcon className="h-5 w-5" />,
        onClick: unfollow,
      },
    canEdit && {
      name: 'Edit name',
      icon: <PencilIcon className="h-5 w-5" />,
      onClick: () => setEditingName(true),
    },
    {
      name: 'See leaderboards',
      icon: <AiOutlineTrophy className="h-5 w-5" />,
      onClick: () => setShowLeaderboards(true),
    }
  ) as DropdownItem[]
  return (
    <>
      <DropdownMenu
        closeOnClick={true}
        Items={groupOptionItems}
        Icon={<DotsVerticalIcon className={clsx('h-5 w-5')} />}
        menuWidth={'w-60'}
        withinOverflowContainer={true}
      />
      <Modal open={editingName} setOpen={setEditingName}>
        <Col className={'bg-canvas-50 rounded-md p-4'}>
          <span className={'text-lg font-bold'}>Edit Topic Name</span>
          <div className={''}>
            <EditableGroupTitle
              group={group}
              isEditing={editingName}
              onFinishEditing={(changed) => {
                setEditingName(false)
                if (changed) router.reload()
              }}
            />
          </div>
        </Col>
      </Modal>
      {showLeaderboards && (
        <GroupLeaderboardModal
          group={group}
          open={showLeaderboards}
          setOpen={setShowLeaderboards}
        />
      )}
      {showAddContract && (
        <AddContractToGroupModal
          group={group}
          open={showAddContract}
          setOpen={setShowAddContract}
          addPermission={addPermission}
        />
      )}
    </>
  )
}

function getAddContractToGroupPermission(
  privacyStatus: PrivacyStatusType,
  userRole: GroupRole | null | undefined,
  isCreator?: boolean
): AddContractToGroupPermissionType {
  if (
    privacyStatus != 'private' &&
    (userRole === 'admin' || userRole === 'moderator' || isCreator)
  ) {
    return 'any'
  }
  if (privacyStatus == 'public') {
    return 'new'
  }
  if (privacyStatus == 'private') {
    return 'private'
  }
  return 'none'
}
const GroupLeaderboardModal = (props: {
  group: Group
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { group, setOpen, open } = props

  const topTraders = useToTopUsers(
    (group && group.cachedLeaderboard?.topTraders) ?? []
  )

  const topCreators = useToTopUsers(
    (group && group.cachedLeaderboard?.topCreators) ?? []
  )
  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <Col className={'bg-canvas-50 rounded-md p-4'}>
        <div className="text-ink-500 mb-4">Updated every 15 minutes</div>
        <Col className={'min-h-[40rem]'}>
          {!topTraders || !topCreators ? (
            <LoadingIndicator />
          ) : (
            <>
              <GroupLeaderboard
                topUsers={topTraders}
                title={`🏅 Top ${BETTORS}`}
                header="Profit"
                maxToShow={25}
              />
              <GroupLeaderboard
                topUsers={topCreators}
                title="🏅 Top creators"
                header="Number of traders"
                maxToShow={25}
                noFormatting={true}
              />
            </>
          )}
        </Col>
      </Col>
    </Modal>
  )
}
const toTopUsers = async (
  cachedUserIds: { userId: string; score: number }[]
): Promise<{ user: User | null; score: number }[]> => {
  const userData = await getUsers(cachedUserIds.map((u) => u.userId))
  const usersById = Object.fromEntries(userData.map((u) => [u.id, u as User]))
  return cachedUserIds
    .map((e) => ({
      user: usersById[e.userId],
      score: e.score,
    }))
    .filter((e) => e.user != null)
}

function useToTopUsers(
  cachedUserIds: { userId: string; score: number }[]
): UserStats[] | null {
  const [topUsers, setTopUsers] = useState<UserStats[]>([])
  useEffect(() => {
    toTopUsers(cachedUserIds).then((result) =>
      setTopUsers(result as UserStats[])
    )
  }, [cachedUserIds])
  return topUsers && topUsers.length > 0 ? topUsers : null
}
type UserStats = { user: User; score: number }

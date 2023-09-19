import { TOPIC_KEY, Group, GroupRole, PrivacyStatusType } from 'common/group'
import { BETTORS, User } from 'common/user'
import { useEffect, useState } from 'react'
import { useGroupRole } from 'web/hooks/use-group-supabase'
import { buildArray } from 'common/util/array'
import { copyToClipboard } from 'web/lib/util/copy'
import { DOMAIN } from 'common/envs/constants'
import toast from 'react-hot-toast'
import {
  LinkIcon,
  DotsVerticalIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import { AiFillTrophy } from 'react-icons/ai'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/comments/dropdown-menu'
import clsx from 'clsx'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { EditableGroupTitle } from 'web/components/groups/editable-group-name'
import router from 'next/router'
import {
  AddContractToGroupModal,
  AddContractToGroupPermissionType,
} from 'web/components/groups/add-contract-to-group-modal'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { GroupLeaderboard } from 'web/components/groups/group-leaderboard'
import { getUsers } from 'web/lib/supabase/user'
import { BsFillPersonDashFill } from 'react-icons/bs'

export function GroupOptions(props: {
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
  const userRole = useGroupRole(group.id, user)
  const isCreator = group.creatorId == user?.id
  const addPermission = getAddContractToGroupPermission(
    group.privacyStatus,
    userRole,
    isCreator
  )

  const groupOptionItems = buildArray(
    {
      name: 'Share',
      icon: <LinkIcon className="h-5 w-5" />,
      onClick: () => {
        copyToClipboard(
          `https://${DOMAIN}/questions/${TOPIC_KEY}=${group.slug}`
        )
        toast.success('Link copied!')
      },
    },
    addPermission != 'none' && {
      name: 'Add questions',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: () => setShowAddContract(true),
    },
    {
      name: 'Leaderboards',
      icon: <AiFillTrophy className="h-5 w-5" />,
      onClick: () => setShowLeaderboards(true),
    },
    canEdit && {
      name: 'Edit name',
      icon: <PencilIcon className="h-5 w-5" />,
      onClick: () => setEditingName(true),
    },
    isMember &&
      !isCreator && {
        name: 'Unfollow',
        icon: <BsFillPersonDashFill className="h-5 w-5" />,
        onClick: unfollow,
      }
  ) as DropdownItem[]
  return (
    <Col onClick={(e) => e.stopPropagation()}>
      <DropdownMenu
        closeOnClick={true}
        Items={groupOptionItems}
        Icon={<DotsVerticalIcon className={clsx('h-5 w-5')} />}
        withinOverflowContainer={true}
        buttonClass={'xl:opacity-0 group-hover:opacity-100'}
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
    </Col>
  )
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
      <Col className={'bg-canvas-50 rounded-xl p-4'}>
        <div className={'min-h-[40rem]'}>
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
              <div className="h-8" />
              <GroupLeaderboard
                topUsers={topCreators}
                title="🏅 Top creators"
                header="Number of traders"
                maxToShow={25}
                noFormatting={true}
              />
            </>
          )}
        </div>
        <div className="text-ink-500 mt-4 text-center">
          Updated every 15 minutes
        </div>
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

export function getAddContractToGroupPermission(
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

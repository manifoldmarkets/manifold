import { Group, GroupRole, PrivacyStatusType, TOPIC_KEY } from 'common/group'
import { User } from 'common/user'
import { useState } from 'react'
import { useGroupRole } from 'web/hooks/use-group-supabase'
import { buildArray } from 'common/util/array'
import { copyToClipboard } from 'web/lib/util/copy'
import { DOMAIN } from 'common/envs/constants'
import toast from 'react-hot-toast'
import {
  DotsVerticalIcon,
  LinkIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/comments/dropdown-menu'
import clsx from 'clsx'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { EditableTopicName } from 'web/components/topics/editable-topic-name'
import router from 'next/router'
import {
  AddContractToGroupModal,
  AddContractToGroupPermissionType,
} from 'web/components/topics/add-contract-to-group-modal'
import { BsFillPersonDashFill } from 'react-icons/bs'
import { AiFillTrophy } from 'react-icons/ai'

export function TopicOptions(props: {
  group: Group
  user: User | null | undefined
  isMember: boolean
  unfollow: () => void
}) {
  const { group, user, isMember, unfollow } = props
  const [editingName, setEditingName] = useState(false)
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
          `https://${DOMAIN}/questions?${TOPIC_KEY}=${group.slug}`
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
      onClick: () => router.push(`/leaderboards?${TOPIC_KEY}=${group.slug}`),
    },
    userRole === 'admin' && {
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
        items={groupOptionItems}
        icon={<DotsVerticalIcon className={clsx('h-5 w-5')} />}
        withinOverflowContainer={true}
        buttonClass={'md:opacity-0 group-hover:opacity-100'}
      />
      <Modal open={editingName} setOpen={setEditingName}>
        <Col className={'bg-canvas-50 rounded-md p-4'}>
          <span className={'text-lg font-bold'}>Edit Topic Name</span>
          <div className={''}>
            <EditableTopicName
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

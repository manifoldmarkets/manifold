import {
  CheckCircleIcon,
  PlusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { Group, PrivacyStatusType } from 'common/group'
import { User } from 'common/user'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { addContractToGroup } from 'web/lib/firebase/api'
import { IconButton } from '../buttons/button'
import { AddMarketToGroupModal } from './add-market-modal'
import { groupRoleType } from './group-member-modal'

export type AddContractToGroupPermissionType =
  | 'private'
  | 'new'
  | 'any'
  | 'none'

export function getAddContractToGroupPermission(
  privacyStatus: PrivacyStatusType,
  userRole: groupRoleType | null
): AddContractToGroupPermissionType {
  if (
    privacyStatus == 'private' &&
    (userRole == 'admin' || userRole == 'moderator')
  ) {
    return 'private'
  }
  if (
    privacyStatus == 'public' &&
    userRole != 'admin' &&
    userRole != 'moderator'
  ) {
    return 'new'
  }
  if (
    privacyStatus != 'private' &&
    (userRole === 'admin' || userRole === 'moderator')
  ) {
    return 'any'
  }
  return 'none'
}

export function AddContractButton(props: {
  group: Group
  user?: User | null
  userRole: groupRoleType | null
  className?: string
}) {
  const { group, user, className, userRole } = props
  const [open, setOpen] = useState(false)
  const addPermission = getAddContractToGroupPermission(
    group.privacyStatus,
    userRole
  )

  async function onSubmit(contracts: Contract[]) {
    await Promise.all(
      contracts.map((contract) =>
        addContractToGroup({
          groupId: group.id,
          contractId: contract.id,
        }).catch((e) => console.log(e))
      )
    )
      .then(() =>
        toast('Succesfully added markets!', {
          icon: <CheckCircleIcon className={'h-5 w-5 text-green-500'} />,
        })
      )
      .catch(() =>
        toast('Error adding markets. Try again?', {
          icon: <XCircleIcon className={'h-5 w-5 text-red-500'} />,
        })
      )
  }
  if (user && addPermission != 'none') {
    return (
      <div className={className}>
        <IconButton
          size="md"
          onClick={() => setOpen(true)}
          className="drop-shadow hover:drop-shadow-lg"
        >
          <div className="bg-canvas-0 relative h-12 w-12 rounded-full">
            <PlusCircleIcon className="text-primary-700 absolute -left-2 -top-2 h-16 w-16 drop-shadow" />
          </div>
        </IconButton>
        <AddMarketToGroupModal
          group={group}
          user={user}
          open={open}
          setOpen={setOpen}
          onAddMarkets={onSubmit}
          addPermission={addPermission}
        />
      </div>
    )
  }
  return <></>
}

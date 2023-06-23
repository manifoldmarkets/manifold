import {
  CheckCircleIcon,
  LockClosedIcon,
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
  | 'private' // user can add a private contract (only new, only belongs in group)
  | 'new' // user can add a new contract
  | 'any' // user can add a new or existing contract
  | 'none' // user cannot add any contract

export function getAddContractToGroupPermission(
  privacyStatus: PrivacyStatusType,
  userRole: groupRoleType | null | undefined
): AddContractToGroupPermissionType {
  if (
    privacyStatus != 'private' &&
    (userRole === 'admin' || userRole === 'moderator')
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

export function AddContractButton(props: {
  group: Group
  user?: User | null
  userRole: groupRoleType | null | undefined
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
        toast('Succesfully added questions!', {
          icon: <CheckCircleIcon className={'h-5 w-5 text-green-500'} />,
        })
      )
      .catch(() =>
        toast('Error adding questions. Try again?', {
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
            {group.privacyStatus == 'private' && (
              <LockClosedIcon className="text-canvas-0 absolute right-[6px] bottom-[4px] h-[16px] w-[16px]" />
            )}
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

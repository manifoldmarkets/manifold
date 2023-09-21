import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import toast from 'react-hot-toast'
import { addContractToGroup } from 'web/lib/firebase/api'
import { AddMarketToGroupModal } from './add-market-modal'
import { useUser } from 'web/hooks/use-user'
import { useGroupFromSlug, useGroupRole } from 'web/hooks/use-group-supabase'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { getAddContractToGroupPermission } from 'web/components/groups/group-options'

export type AddContractToGroupPermissionType =
  | 'private' // user can add a private contract (only new, only belongs in group)
  | 'new' // user can add a new contract
  | 'any' // user can add a new or existing contract
  | 'none' // user cannot add any contract

export function AddContractToGroupModal(props: {
  group: Group
  open: boolean
  setOpen: (open: boolean) => void
  className?: string
  addPermission: AddContractToGroupPermissionType
}) {
  const { group, open, setOpen, addPermission, className } = props
  const user = useUser()
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
  if (user) {
    return (
      <div className={className}>
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

export const AddContractToGroupButton = (props: { groupSlug: string }) => {
  const { groupSlug } = props
  const group = useGroupFromSlug(groupSlug)
  const [open, setOpen] = useState(false)
  const user = useUser()
  const userRole = useGroupRole(group?.id ?? '_', user)
  if (!group) return <></>
  const isCreator = group.creatorId == user?.id
  const addPermission = getAddContractToGroupPermission(
    group.privacyStatus,
    userRole,
    isCreator
  )
  return (
    <>
      {addPermission !== 'none' && (
        <Button onClick={() => setOpen(true)}>Add a question</Button>
      )}
      {group && (
        <AddContractToGroupModal
          group={group}
          open={open}
          setOpen={setOpen}
          addPermission={addPermission}
        />
      )}
    </>
  )
}

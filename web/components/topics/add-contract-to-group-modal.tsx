import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import toast from 'react-hot-toast'
import { api } from 'web/lib/api/api'
import { AddMarketToGroupModal } from './add-market-modal'
import { useUser } from 'web/hooks/use-user'
import {
  useGroupFromSlug,
  useGroupRoleInfo,
} from 'web/hooks/use-group-supabase'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { getAddContractToGroupPermission } from 'web/components/topics/topic-options'
import { User } from 'common/user'
import { ModActionBadge } from 'web/components/moderation/mod-action'

export type AddContractToGroupPermissionType =
  | 'new' // user can add a new contract
  | 'any' // user can add a new or existing contract
  | 'none' // user cannot add any contract

export function AddContractToGroupModal(props: {
  group: Group
  open: boolean
  setOpen: (open: boolean) => void
  user: User
  className?: string
}) {
  const { group, open, user, setOpen, className } = props
  const { role: userRole, topicRole } = useGroupRoleInfo(group.id, user)
  const isCreator = group.creatorId == user.id
  const addPermission = getAddContractToGroupPermission(
    group.privacyStatus,
    userRole,
    isCreator
  )
  // What the user could do without site mod powers
  const nonModPermission = getAddContractToGroupPermission(
    group.privacyStatus,
    topicRole,
    isCreator
  )
  async function onSubmit(contracts: Contract[]) {
    await Promise.all(
      contracts.map((contract) =>
        api('market/:contractId/group', {
          groupId: group.id,
          contractId: contract.id,
        }).catch((e) => console.log(e))
      )
    )
      .then(() =>
        toast('Successfully added questions!', {
          icon: <CheckCircleIcon className={'h-5 w-5 text-green-500'} />,
        })
      )
      .catch(() =>
        toast('Error adding questions. Try again?', {
          icon: <XCircleIcon className={'text-error h-5 w-5'} />,
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
          nonModPermission={nonModPermission}
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
  const { role: userRole, topicRole } = useGroupRoleInfo(group?.id ?? '_', user)
  if (!group) return <></>
  const addPermission = getAddContractToGroupPermission(
    group.privacyStatus,
    userRole,
    group.creatorId == user?.id
  )
  const modAction =
    getAddContractToGroupPermission(
      group.privacyStatus,
      topicRole,
      group.creatorId == user?.id
    ) === 'none'
  return (
    <>
      {addPermission !== 'none' && (
        <Button
          color={modAction ? 'purple' : undefined}
          onClick={() => setOpen(true)}
        >
          {modAction && <ModActionBadge className="mr-1" />}
          Add a question
        </Button>
      )}
      {group && user && (
        <AddContractToGroupModal
          group={group}
          open={open}
          setOpen={setOpen}
          user={user}
        />
      )}
    </>
  )
}

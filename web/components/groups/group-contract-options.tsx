import { DotsVerticalIcon, MinusCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { removeContractFromGroup } from 'web/lib/firebase/api'
import DropdownMenu from '../comments/dropdown-menu'

export function GroupContractOptions(props: {
  group: Group
  contract: Contract
}) {
  const { group, contract } = props

  const contractOptions = [
    {
      icon: <MinusCircleIcon className="h-5 w-5" />,
      name: 'Remove from category',
      onClick: async () => {
        await removeContractFromGroup({
          groupId: group.id,
          contractId: contract.id,
        })
      },
    },
  ]
  return (
    <DropdownMenu
      Items={contractOptions}
      Icon={<DotsVerticalIcon className={clsx('text-ink-400 h-5 w-5')} />}
      menuWidth={'w-52'}
    />
  )
}

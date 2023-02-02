import { DotsVerticalIcon, MinusCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import e from 'cors'
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
      name: 'Remove from group',
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
      Icon={<DotsVerticalIcon className={clsx('h-5 w-5 text-gray-400')} />}
      menuWidth={'w-52'}
      //   className={clsx(className)}
    />
  )
}

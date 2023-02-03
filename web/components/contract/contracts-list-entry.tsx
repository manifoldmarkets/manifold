import { Contract } from 'common/contract'
import Link from 'next/link'
import { getProbability } from 'common/calculate'
import { getValueFromBucket } from 'common/calculate-dpm'
import { contractPath, getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { getTextColor } from '../bet/quick-bet'
import { Avatar } from '../widgets/avatar'

function ContractStatusLabel(props: { contract: Contract }) {
  const { contract } = props
  const probTextColor = getTextColor(contract)

  switch (contract.outcomeType) {
    case 'BINARY': {
      return contract.resolution ? (
        <BinaryContractOutcomeLabel
          contract={contract}
          resolution={contract.resolution}
        />
      ) : (
        <span className={probTextColor}>
          {getBinaryProbPercent(contract, true)}
        </span>
      )
    }
    case 'PSEUDO_NUMERIC': {
      const val = contract.resolutionProbability ?? getProbability(contract)
      return <span>{getFormattedMappedValue(contract, val)}</span>
    }
    case 'NUMERIC': {
      const val = contract.resolutionValue ?? getValueFromBucket('', contract)
      return <span>{getFormattedMappedValue(contract, val)}</span>
    }
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE': {
      return <span>FR</span>
    }
    case 'CERT': {
      return <span>CERT</span>
    }
  }
}

// TODO: Replace with a proper table/datagrid implementation?
export function ContractsListEntry(props: { contract: Contract }) {
  const { contract } = props
  return (
    <Link
      href={contractPath(contract)}
      className="group flex flex-row gap-2 whitespace-nowrap rounded-sm p-2 hover:bg-indigo-50 focus:bg-indigo-50 md:gap-4"
    >
      <Avatar
        username={contract.creatorUsername}
        avatarUrl={contract.creatorAvatarUrl}
        size="xs"
      />
      <div className="min-w-[34px] rounded-full font-semibold">
        <ContractStatusLabel contract={contract} />
      </div>
      <div className="break-anywhere mr-0.5 whitespace-normal font-medium text-gray-900">
        {contract.question}
      </div>
    </Link>
  )
}

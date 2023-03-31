import { Contract } from 'common/contract'
import { useContractParams } from 'web/hooks/use-contract-supabase'
import { usePrivateContract } from 'web/hooks/use-contracts'
import { ContractPageContent } from 'web/pages/[username]/[contractSlug]'
import {
  InaccessiblePrivateThing,
  LoadingPrivateThing,
} from '../groups/private-group'

export function PrivateContractPage(props: { contractSlug: string }) {
  const { contractSlug } = props
  const contract = usePrivateContract(contractSlug, 1000)
  if (contract === undefined) {
    return <LoadingPrivateThing />
  }
  if (contract === null) return <InaccessiblePrivateThing thing="market" />
  else {
    return <ContractParamsPageContent contract={contract} />
  }
}

export function ContractParamsPageContent(props: { contract: Contract }) {
  const { contract } = props
  const contractParams = useContractParams(contract)
  if (contractParams === undefined) return <LoadingPrivateThing />
  return <ContractPageContent contractParams={contractParams} />
}

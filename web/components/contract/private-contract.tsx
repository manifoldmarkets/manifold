import { useContractParams } from 'web/hooks/use-contract-supabase'
import { ContractPageContent } from 'web/pages/[username]/[contractSlug]'
import {
  InaccessiblePrivateThing,
  LoadingPrivateThing,
} from '../groups/private-group'

export function PrivateContractPage(props: { contractSlug: string }) {
  const { contractSlug } = props
  const contractParameters = useContractParams(contractSlug)

  if (contractParameters === undefined) {
    return <LoadingPrivateThing />
  } else if (contractParameters.state !== 'authed')
    return <InaccessiblePrivateThing thing="market" />
  else {
    return <ContractPageContent contractParams={contractParameters.params} />
  }
}

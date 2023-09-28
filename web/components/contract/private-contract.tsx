import { useContractParams } from 'web/hooks/use-contract-supabase'
import { ContractPageContent } from 'web/pages/[username]/[contractSlug]'
import {
  InaccessiblePrivateThing,
  LoadingPrivateThing,
} from 'web/components/topics/private-topic'
import Custom404 from 'web/pages/404'

export function PrivateContractPage(props: { contractSlug: string }) {
  const { contractSlug } = props
  const contractParameters = useContractParams(contractSlug)

  if (contractParameters === undefined) {
    return <LoadingPrivateThing />
  }
  // Let admins to see deleted markets
  else if (contractParameters.state === 'not found') return <Custom404 />
  else if (contractParameters.state !== 'authed')
    return <InaccessiblePrivateThing thing="market" />
  else {
    return <ContractPageContent contractParams={contractParameters.params} />
  }
}

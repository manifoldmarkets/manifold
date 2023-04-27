import { Contract, ContractParams } from 'common/contract'
import { useContractParams } from 'web/hooks/use-contract-supabase'
import { usePrivateContract } from 'web/hooks/use-contracts'
import {
  ContractPageContent,
  ContractParameters,
} from 'web/pages/[username]/[contractSlug]'
import {
  InaccessiblePrivateThing,
  LoadingPrivateThing,
} from '../groups/private-group'
import { useIsAuthorized } from 'web/hooks/use-user'
import { useEffect } from 'react'

export function PrivateContractPage(props: {
  contractSlug: string
  contractParams?: ContractParams
}) {
  const { contractSlug, contractParams } = props
  const contractParameters = useContractParams(contractSlug)
  const privateContractParams =
    contractParams ?? contractParameters?.contractParams

  console.log(contractParams, contractParameters)

  if (contractParameters === undefined) {
    return <LoadingPrivateThing />
  } else if (!privateContractParams)
    return <InaccessiblePrivateThing thing="market" />
  else {
    return <ContractPageContent contractParams={privateContractParams} />
  }
}

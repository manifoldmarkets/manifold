import { getInitialProbability } from 'common/calculate'
import {
  AnyContractType,
  BinaryContract,
  Contract,
  PseudoNumericContract,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getTotalContractMetrics } from 'common/supabase/contract-metrics'
import { removeUndefinedProps } from 'common/util/object'
import { useEffect, useState } from 'react'
import { useBetCount, useBets } from 'web/hooks/use-bets-supabase'
import { useComments } from 'web/hooks/use-comments-supabase'
import { useContractParams } from 'web/hooks/use-contract-supabase'
import { usePrivateContract } from 'web/hooks/use-contracts'
import { getInitialRelatedMarkets } from 'web/hooks/use-related-contracts'
import { useUserById } from 'web/hooks/use-user-supabase'
import {
  getBinaryContractUserContractMetrics,
  getTopContractMetrics,
} from 'web/lib/firebase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import {
  ContractPageContent,
  ContractParams,
} from 'web/pages/[username]/[contractSlug]'
import {
  InaccessiblePrivateThing,
  LoadingPrivateThing,
} from '../groups/private-group'
import {
  getBetPoints,
  getHistoryDataBets,
  getUseBetLimit,
  shouldUseBetPoints,
} from './contract-page-helpers'

export function PrivateContractPage(props: { contractSlug: string }) {
  const { contractSlug } = props
  const contract = usePrivateContract(contractSlug, 1000)

  if (contract === undefined) {
    return <LoadingPrivateThing />
  } else if (contract === null)
    return <InaccessiblePrivateThing thing="market" />
  else {
    return <ContractParamsPageContent contract={contract} />
  }
}

export function ContractParamsPageContent(props: {
  contract: Contract<AnyContractType>
}) {
  const { contract } = props
  const contractParams = useContractParams(contract)
  return <ContractPageContent contractParams={contractParams} />
}

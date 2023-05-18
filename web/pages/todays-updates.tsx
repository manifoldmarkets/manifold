import { ContractMetrics } from 'common/calculate-metrics'
import { CPMMContract, Contract } from 'common/contract'
import { getContractMetricsForContractIds } from 'common/supabase/contract-metrics'
import { useEffect, useState } from 'react'
import { ContractChangeTable } from 'web/components/contract/prob-change-table'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { useYourDailyChangedContracts } from 'web/hooks/use-your-daily-changed-contracts'
import { db } from 'web/lib/supabase/db'

export default function TodaysUpdates() {
  const user = useUser()
  const changedContracts = useYourDailyChangedContracts(db, user?.id, 50)
  const metrics = useContractMetrics(user?.id, changedContracts ?? [])

  const contractMetrics = metrics
    ?.map((m) => ({
      metrics: m,
      contract: changedContracts?.find((c) => c.id === m.contractId),
    }))
    .filter((m) => m.contract) as
    | {
        metrics: ContractMetrics
        contract: CPMMContract
      }[]
    | undefined

  const isLoading = !changedContracts || !metrics

  return (
    <Page>
      <Title>Today's updates</Title>
      {isLoading ? (
        <LoadingIndicator />
      ) : (
        <ContractChangeTable contractMetrics={contractMetrics} />
      )}
    </Page>
  )
}

const useContractMetrics = (
  userId: string | null | undefined,
  contracts: Contract[]
) => {
  const [metrics, setMetrics] = useState<ContractMetrics[] | undefined>()
  useEffect(() => {
    if (userId) {
      getContractMetricsForContractIds(
        db,
        userId,
        contracts.map((c) => c.id)
      ).then(setMetrics)
    }
  }, [userId, contracts])
  return metrics
}

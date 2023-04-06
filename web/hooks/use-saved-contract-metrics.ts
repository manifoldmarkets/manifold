import { ContractMetrics } from 'common/calculate-metrics'
import { Contract } from 'common/contract'
import { useUser, useUserContractMetrics } from './use-user'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { usePersistentLocalState } from './use-persistent-local-state'

export const useSavedContractMetrics = (contract: Contract) => {
  const user = useUser()
  const contractMetrics = contract
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useUserContractMetrics(user?.id, contract.id)
    : null
  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetrics | undefined
  >(undefined, `contract-metrics-${contract.id}`)

  const metrics =
    contractMetrics || savedMetrics
      ? ({
          ...savedMetrics,
          ...contractMetrics,
        } as ContractMetrics)
      : undefined

  useEffectCheckEquality(() => {
    if (metrics) setSavedMetrics(metrics)
  }, [metrics, setSavedMetrics])

  return metrics
}

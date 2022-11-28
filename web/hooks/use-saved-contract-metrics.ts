import { Bet } from 'common/bet'
import { getContractBetMetrics } from 'common/calculate'
import { ContractMetrics } from 'common/calculate-metrics'
import { Contract } from 'common/contract'
import {
  usePersistentState,
  storageStore,
  inMemoryStore,
} from './use-persistent-state'
import { useUser, useUserContractMetrics } from './use-user'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { safeLocalStorage } from 'web/lib/util/local'

export const useSavedContractMetrics = (
  contract: Contract,
  userBets: Bet[] | undefined
) => {
  const user = useUser()
  const contractMetrics = useUserContractMetrics(user?.id, contract.id)
  const isDev =
    typeof window !== 'undefined'
      ? window.location.origin.startsWith('http://localhost')
      : false
  const [savedMetrics, setSavedMetrics] = usePersistentState<
    ContractMetrics | undefined
  >(undefined, {
    key: `contract-metrics-${contract.id}`,
    store: isDev ? inMemoryStore() : storageStore(safeLocalStorage()),
  })

  const computedMetrics = userBets
    ? getContractBetMetrics(contract, userBets)
    : savedMetrics

  const metrics =
    contractMetrics || savedMetrics || computedMetrics
      ? ({
          ...savedMetrics,
          ...contractMetrics,
          // Computed metrics has a subset of the fields of contract metrics.
          ...computedMetrics,
        } as ContractMetrics)
      : undefined

  useEffectCheckEquality(() => {
    if (metrics) setSavedMetrics(metrics)
  }, [metrics, setSavedMetrics])

  return metrics
}

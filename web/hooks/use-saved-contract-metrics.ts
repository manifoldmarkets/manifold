import { Bet } from 'common/bet'
import { getContractBetMetrics } from 'common/calculate'
import { Contract } from 'common/contract'
import { safeLocalStorage } from 'web/lib/util/local'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { inMemoryStore, usePersistentState } from './use-persistent-state'

export const useSavedContractMetrics = (
  contract: Contract,
  userBets: Bet[] | undefined
) => {
  const [savedMetrics, setSavedMetrics] = usePersistentState(undefined, {
    key: `contract-metrics-${contract.id}`,
    store: inMemoryStore(),
  })

  const metrics = userBets
    ? getContractBetMetrics(contract, userBets)
    : savedMetrics

  useEffectCheckEquality(() => {
    const local = safeLocalStorage()

    // Read metrics from local storage.
    const savedMetrics = local?.getItem(`${contract.id}-metrics`)
    if (savedMetrics) {
      setSavedMetrics(JSON.parse(savedMetrics))
    }

    if (metrics) {
      // Save metrics to local storage.
      const metricsData = JSON.stringify(metrics)
      local?.setItem(`${contract.id}-metrics`, metricsData)
    }
  }, [contract.id, metrics])

  return metrics
}

import { Bet } from 'common/bet'
import { getContractBetMetrics, getContractPositions } from 'common/calculate'
import { ContractMetric } from 'common/contract-metric'
import { ContractPositions } from 'common/contract-positions'
import { Contract } from 'common/contract'
import {
  usePersistentState,
  storageStore,
  inMemoryStore,
} from './use-persistent-state'
import {
  useUser,
  useUserContractMetrics,
  useUserContractPositions,
} from './use-user'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { safeLocalStorage } from 'web/lib/util/local'

export const useSavedContractInfo = (
  contract: Contract,
  userBets: Bet[] | undefined
) => {
  const user = useUser()
  const contractMetrics = useUserContractMetrics(user?.id, contract.id)
  const contractPositions = useUserContractPositions(user?.id, contract.id)
  const isDev =
    typeof window !== 'undefined'
      ? window.location.origin.startsWith('http://localhost')
      : false

  const [savedMetrics, setSavedMetrics] = usePersistentState<
    ContractMetric | undefined
  >(undefined, {
    key: `contract-metrics-${contract.id}-v2`,
    store: isDev ? inMemoryStore() : storageStore(safeLocalStorage()),
  })
  const [savedPositions, setSavedPositions] = usePersistentState<
    ContractPositions | undefined
  >(undefined, {
    key: `contract-positions-${contract.id}`,
    store: isDev ? inMemoryStore() : storageStore(safeLocalStorage()),
  })

  const computedMetrics = userBets
    ? getContractBetMetrics(contract, userBets)
    : savedMetrics
  const computedPositions = userBets
    ? getContractPositions(userBets)
    : savedMetrics

  const metrics =
    contractMetrics || savedMetrics || computedMetrics
      ? ({
          ...savedMetrics,
          ...contractMetrics,
          // Computed metrics has a subset of the fields of contract metrics.
          ...computedMetrics,
        } as ContractMetric)
      : undefined
  const positions =
    contractPositions || savedPositions || computedPositions
      ? ({
          ...savedPositions,
          ...contractPositions,
          ...computedPositions,
        } as ContractPositions)
      : undefined

  useEffectCheckEquality(() => {
    if (metrics) setSavedMetrics(metrics)
  }, [metrics, setSavedMetrics])

  useEffectCheckEquality(() => {
    if (positions) setSavedPositions(positions)
  }, [positions, setSavedPositions])

  return [metrics, positions] as const
}

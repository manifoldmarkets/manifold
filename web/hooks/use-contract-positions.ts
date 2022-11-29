import { useEffect, useState } from 'react'
import { listenForValues } from 'web/lib/firebase/utils'
import {
  collectionGroup,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import {
  ContractPositionsByOutcome,
  CONTRACT_POSITIONS_SORTED_INDICES,
} from 'web/lib/firebase/contract-positions'
import { ContractPositions } from 'common/contract-positions'

export const useContractPositions = (
  contractId: string,
  count: number,
  outcomes: string[]
) => {
  const [contractMetrics, setContractMetrics] = useState<
    ContractPositionsByOutcome | undefined
  >()

  useEffect(() => {
    if (!contractId) return
    const listeners = outcomes.map((outcome) =>
      listenForContractPositionsOnContract(
        contractId,
        (cm) =>
          setContractMetrics((prev) => {
            // We filter yes and no outcomes on the query side
            const filtered =
              outcome !== 'YES' && outcome !== 'NO'
                ? cm.filter(
                    (c) =>
                      c.totalShares[outcome] && c.totalShares[outcome] > 0.1
                  )
                : cm
            const resultsAlreadySorted =
              CONTRACT_POSITIONS_SORTED_INDICES.includes(outcome)
            if (resultsAlreadySorted) {
              return { ...prev, [outcome]: filtered }
            } else {
              const sorted = filtered.sort(
                (a, b) => b.totalShares[outcome] - a.totalShares[outcome]
              )
              return { ...prev, [outcome]: sorted }
            }
          }),
        {
          count,
          sortedOutcome: CONTRACT_POSITIONS_SORTED_INDICES.includes(outcome)
            ? outcome
            : undefined,
        }
      )
    )

    return () => {
      listeners?.forEach((l) => l())
    }
  }, [count, contractId, outcomes.length])

  return contractMetrics
}

// If you want shares sorted in descending order you have to make a new index for that outcome.
// You can still get all users with contract-metrics and shares without the index and sort them in the client
export function listenForContractPositionsOnContract(
  contractId: string,
  setMetrics: (metrics: ContractPositions[]) => void,
  options: {
    sortedOutcome: typeof CONTRACT_POSITIONS_SORTED_INDICES[number] | undefined
    count: number
  }
) {
  const { sortedOutcome, count } = options
  if (sortedOutcome) {
    const sortedQuery = query(
      collectionGroup(db, 'contract-positions'),
      where('contractId', '==', contractId),
      // This allows us to skip filtering the metrics by outcome in the client
      where(
        sortedOutcome === 'YES'
          ? 'hasYesShares'
          : sortedOutcome === 'NO'
          ? 'hasNoShares'
          : 'hasShares',
        '==',
        true
      ),
      orderBy('totalShares.' + sortedOutcome, 'desc'),
      limit(count)
    )
    return listenForValues<ContractPositions>(sortedQuery, setMetrics)
  } else {
    const unsortedQuery = query(
      collectionGroup(db, 'contract-positions'),
      where('contractId', '==', contractId),
      where('hasShares', '==', true),
      limit(count)
    )
    return listenForValues<ContractPositions>(unsortedQuery, setMetrics)
  }
}

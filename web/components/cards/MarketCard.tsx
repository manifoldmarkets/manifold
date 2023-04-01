import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getUserContractMetricsWithContracts } from 'common/supabase/contract-metrics'
import { buildArray } from 'common/util/array'
import { Dictionary, sortBy, uniqBy } from 'lodash'
import Image from 'next/image'
import { useEffect } from 'react'
import { ContractStatusLabel } from 'web/components/contract/contracts-list-entry'
import {
  usePersistentState,
  inMemoryStore,
} from 'web/hooks/use-persistent-state'
import { db } from 'web/lib/supabase/db'

// Find 100 top markets in terms of value from this user
// Mostly extracted from BetsList
export function useTopMarketsByUser(userId: string) {
  const [initialContracts, setInitialContracts] = usePersistentState<
    Contract[] | undefined
  >(undefined, {
    key: `user-contract-metrics-contracts-${userId}`,
    store: inMemoryStore(),
  })

  const [metricsByContract, setMetricsByContract] = usePersistentState<
    Dictionary<ContractMetric> | undefined
  >(undefined, {
    key: `user-contract-metrics-${userId}`,
    store: inMemoryStore(),
  })

  useEffect(() => {
    getUserContractMetricsWithContracts(userId, db, 5000).then(
      (metricsWithContracts) => {
        const { contracts, metricsByContract } = metricsWithContracts
        setInitialContracts((c) =>
          uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
        )
        setMetricsByContract(metricsByContract)
      }
    )
  }, [userId, setMetricsByContract, setInitialContracts])

  const contracts = initialContracts?.filter((c) => !c.resolutionTime)
  const sorted = sortBy(
    contracts,
    (c) => -(metricsByContract?.[c.id].payout ?? 0)
  )
  for (const contract of sorted.slice(0, 100)) {
    console.log(metricsByContract?.[contract.id].payout, contract.question)
  }
  return sorted.slice(0, 100)
}

export function MarketCard(props: {
  contract: Contract
  faceup: boolean
  onClick: () => void
}) {
  const { contract, faceup, onClick } = props
  return (
    <div
      className="font-grenze-gotisch relative h-[300px] w-[200px] cursor-zoom-in transition hover:z-10 hover:scale-125"
      onClick={onClick}
    >
      {faceup ? (
        <>
          <Image
            className="absolute top-0 left-0"
            src={
              contract.coverImageUrl ||
              `https://picsum.photos/seed/${contract.id}/200/200`
            }
            width={200}
            height={200}
            alt={contract.question}
          />
          <Image
            className="absolute top-0 left-0"
            src={'/cards/frame_red.png'}
            width={200}
            height={200}
            alt="Card frame"
          />
          <div className="line-clamp-1 absolute top-[145px] left-0 w-full bg-transparent text-center text-2xl font-extrabold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]">
            <ContractStatusLabel contract={contract} />
          </div>
          <div className="line-clamp-4 absolute top-[200px] left-[20px] w-[160px] text-center text-sm leading-3 text-black">
            {contract.question}
          </div>
        </>
      ) : (
        <Image
          className="absolute top-0 left-0"
          src={'/cards/back_red.png'}
          width={200}
          height={200}
          alt="Card back"
        />
      )}
    </div>
  )
}

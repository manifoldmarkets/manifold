import {
  Binary,
  CPMM,
  DPM,
  FreeResponseContract,
  FullContract,
} from 'common/contract'
import { Bet } from 'common/bet'
import { useEffect, useState } from 'react'
import { partition, sumBy } from 'lodash'
import { safeLocalStorage } from 'web/lib/util/local'

export const useSaveShares = (
  contract: FullContract<CPMM | DPM, Binary | FreeResponseContract>,
  userBets: Bet[] | undefined,
  freeResponseAnswerOutcome?: string
) => {
  const [savedShares, setSavedShares] = useState<
    | {
        yesShares: number
        noShares: number
        yesFloorShares: number
        noFloorShares: number
      }
    | undefined
  >()

  // TODO: How do we handle numeric yes / no bets? - maybe bet amounts above vs below the highest peak
  const [yesBets, noBets] = partition(userBets ?? [], (bet) =>
    freeResponseAnswerOutcome
      ? bet.outcome === freeResponseAnswerOutcome
      : bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    sumBy(yesBets, (bet) => bet.shares),
    sumBy(noBets, (bet) => bet.shares),
  ]

  const yesFloorShares = Math.round(yesShares) === 0 ? 0 : Math.floor(yesShares)
  const noFloorShares = Math.round(noShares) === 0 ? 0 : Math.floor(noShares)

  useEffect(() => {
    const local = safeLocalStorage()
    // Save yes and no shares to local storage.
    const savedShares = local?.getItem(`${contract.id}-shares`)
    if (!userBets && savedShares) {
      setSavedShares(JSON.parse(savedShares))
    }

    if (userBets) {
      const updatedShares = { yesShares, noShares }
      local?.setItem(`${contract.id}-shares`, JSON.stringify(updatedShares))
    }
  }, [contract.id, userBets, noShares, yesShares])

  if (userBets) return { yesShares, noShares, yesFloorShares, noFloorShares }
  return (
    savedShares ?? {
      yesShares: 0,
      noShares: 0,
      yesFloorShares: 0,
      noFloorShares: 0,
    }
  )
}

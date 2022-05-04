import { Binary, CPMM, DPM, FullContract } from '../../common/contract'
import { Bet } from '../../common/bet'
import { useEffect, useState } from 'react'
import _ from 'lodash'

export const useSaveShares = (
  contract: FullContract<CPMM | DPM, Binary>,
  userBets: Bet[] | undefined
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

  const [yesBets, noBets] = _.partition(
    userBets ?? [],
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    _.sumBy(yesBets, (bet) => bet.shares),
    _.sumBy(noBets, (bet) => bet.shares),
  ]

  const yesFloorShares = Math.round(yesShares) === 0 ? 0 : Math.floor(yesShares)
  const noFloorShares = Math.round(noShares) === 0 ? 0 : Math.floor(noShares)

  useEffect(() => {
    // Save yes and no shares to local storage.
    const savedShares = localStorage.getItem(`${contract.id}-shares`)
    if (!userBets && savedShares) {
      setSavedShares(JSON.parse(savedShares))
    }

    if (userBets) {
      const updatedShares = { yesShares, noShares }
      localStorage.setItem(
        `${contract.id}-shares`,
        JSON.stringify(updatedShares)
      )
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

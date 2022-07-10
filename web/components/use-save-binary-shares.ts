import { BinaryContract, PseudoNumericContract } from 'common/contract'
import { Bet } from 'common/bet'
import { useEffect, useState } from 'react'
import { partition, sumBy } from 'lodash'
import { safeLocalStorage } from 'web/lib/util/local'

export const useSaveBinaryShares = (
  contract: BinaryContract | PseudoNumericContract,
  userBets: Bet[] | undefined
) => {
  const [savedShares, setSavedShares] = useState({ yesShares: 0, noShares: 0 })

  const [yesBets, noBets] = partition(
    userBets ?? [],
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = userBets
    ? [sumBy(yesBets, (bet) => bet.shares), sumBy(noBets, (bet) => bet.shares)]
    : [savedShares.yesShares, savedShares.noShares]

  useEffect(() => {
    const local = safeLocalStorage()

    // Read shares from local storage.
    const savedShares = local?.getItem(`${contract.id}-shares`)
    if (savedShares) {
      setSavedShares(JSON.parse(savedShares))
    }

    if (userBets) {
      // Save shares to local storage.
      const sharesData = JSON.stringify({ yesShares, noShares })
      local?.setItem(`${contract.id}-shares`, sharesData)
    }
  }, [contract.id, userBets, noShares, yesShares])

  const hasYesShares = yesShares >= 1
  const hasNoShares = noShares >= 1

  const sharesOutcome = hasYesShares
    ? ('YES' as const)
    : hasNoShares
    ? ('NO' as const)
    : undefined
  const shares =
    sharesOutcome === 'YES' ? yesShares : sharesOutcome === 'NO' ? noShares : 0

  return {
    yesShares,
    noShares,
    shares,
    sharesOutcome,
    hasYesShares,
    hasNoShares,
  }
}

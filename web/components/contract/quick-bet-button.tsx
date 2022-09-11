import {
  getOutcomeProbability,
  getProbability,
  getTopAnswer,
} from 'common/calculate'
import { getExpectedValue } from 'common/calculate-dpm'
import { User } from 'common/user'
import { Contract, CPMMBinaryContract, NumericContract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import toast from 'react-hot-toast'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { placeBet } from 'web/lib/firebase/api'
import { useSaveBinaryShares } from '../use-save-binary-shares'
import { sellShares } from 'web/lib/firebase/api'
import { calculateCpmmSale } from 'common/calculate-cpmm'
import { track } from 'web/lib/service/analytics'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { getBinaryProb } from 'common/contract-details'
import { quickOutcome } from 'web/components/contract/quick-bet-arrows'
import { Button } from 'web/components/button'

const BET_SIZE = 10

export function QuickBetButtons(props: {
  contract: CPMMBinaryContract
  user: User
  side: 'YES' | 'NO'
  className?: string
}) {
  const { contract, side, user } = props
  let sharesSold: number | undefined
  let sellOutcome: 'YES' | 'NO' | undefined
  let saleAmount: number | undefined

  const userBets = useUserContractBets(user.id, contract.id)
  const unfilledBets = useUnfilledBets(contract.id) ?? []

  const { yesShares, noShares } = useSaveBinaryShares(contract, userBets)
  const oppositeShares = side === 'YES' ? noShares : yesShares
  if (oppositeShares > 0.01) {
    sellOutcome = side === 'YES' ? 'NO' : 'YES'

    const prob = getProb(contract)
    const maxSharesSold =
      (BET_SIZE + 0.05) / (sellOutcome === 'YES' ? prob : 1 - prob)
    sharesSold = Math.min(oppositeShares, maxSharesSold)

    const { saleValue } = calculateCpmmSale(
      contract,
      sharesSold,
      sellOutcome,
      unfilledBets
    )
    saleAmount = saleValue
  }

  async function placeQuickBet() {
    const betPromise = async () => {
      if (sharesSold && sellOutcome) {
        return await sellShares({
          shares: sharesSold,
          outcome: sellOutcome,
          contractId: contract.id,
        })
      }

      const outcome = quickOutcome(contract, side === 'YES' ? 'UP' : 'DOWN')
      return await placeBet({
        amount: BET_SIZE,
        outcome,
        contractId: contract.id,
      })
    }
    const shortQ = contract.question.slice(0, 20)
    const message =
      sellOutcome && saleAmount
        ? `${formatMoney(saleAmount)} sold of "${shortQ}"...`
        : `${formatMoney(BET_SIZE)} on "${shortQ}"...`

    toast.promise(betPromise(), {
      loading: message,
      success: message,
      error: (err) => `${err.message}`,
    })

    track('quick bet button', {
      slug: contract.slug,
      outcome: side,
      contractId: contract.id,
    })
  }

  return (
    <Button
      size={'lg'}
      onClick={() => placeQuickBet()}
      color={side === 'YES' ? 'green' : 'red'}
      className={props.className}
    >
      {side === 'YES' ? 'Yes' : 'No'}
    </Button>
  )
}

// Return a number from 0 to 1 for this contract
// Resolved contracts are set to 1, for coloring purposes (even if NO)
function getProb(contract: Contract) {
  const { outcomeType, resolution, resolutionProbability } = contract
  return resolutionProbability
    ? resolutionProbability
    : resolution
    ? 1
    : outcomeType === 'BINARY'
    ? getBinaryProb(contract)
    : outcomeType === 'PSEUDO_NUMERIC'
    ? getProbability(contract)
    : outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE'
    ? getOutcomeProbability(contract, getTopAnswer(contract)?.id || '')
    : outcomeType === 'NUMERIC'
    ? getNumericScale(contract)
    : 1 // Should not happen
}

function getNumericScale(contract: NumericContract) {
  const { min, max } = contract
  const ev = getExpectedValue(contract)
  return (ev - min) / (max - min)
}

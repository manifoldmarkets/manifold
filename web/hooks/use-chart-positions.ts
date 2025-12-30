import { useBetsOnce } from 'client-common/hooks/use-bets'
import { DisplayUser } from 'common/api/user-types'
import { getContractBetMetrics } from 'common/calculate'
import { ChartPosition } from 'common/chart-position'
import { Contract } from 'common/contract'
import { useMemo, useState } from 'react'
import { getAnswerColor } from 'web/components/charts/contract/choice'
import { api } from 'web/lib/api/api'

export const useChartPositions = (
  contract: Contract,
  externalDisplayUser?: DisplayUser,
  externalSetDisplayUser?: (user: DisplayUser | undefined) => void
) => {
  const [internalDisplayUser, setInternalDisplayUser] = useState<DisplayUser>()

  // Use external state if provided, otherwise use internal state
  const displayUser = externalSetDisplayUser
    ? externalDisplayUser
    : internalDisplayUser
  const setDisplayUser = externalSetDisplayUser ?? setInternalDisplayUser

  const usersBets = useBetsOnce((params) => api('bets', params), {
    contractId: contract.id,
    userId: displayUser?.id,
    filterRedemptions: true,
    beforeTime: displayUser?.id ? undefined : 1,
    order: 'asc',
  })
  const [hoveredChartPosition, setHoveredChartPosition] =
    useState<ChartPosition | null>(null)

  const chartPositions = useMemo(() => {
    if (!usersBets?.length) return []
    const answers = 'answers' in contract ? contract.answers : []

    return usersBets.map((bet) => {
      const a = answers.find((a) => a.id === bet.answerId)
      // For binary markets: green for buying YES / selling NO, red for selling YES / buying NO
      const isBuy = bet.amount > 0
      const isBullish =
        (isBuy && bet.outcome === 'YES') || (!isBuy && bet.outcome === 'NO')
      const color = a
        ? getAnswerColor(a)
        : isBullish
        ? '#16a34a' // green-600
        : '#dc2626' // red-600
      const contractMetric = getContractBetMetrics(
        contract,
        [bet],
        bet.answerId
      )

      return {
        id: bet.id,
        amount: bet.amount,
        direction: bet.outcome === 'YES' ? bet.amount : -bet.amount,
        outcome: bet.outcome,
        shares: bet.shares,
        orderAmount: bet.orderAmount,
        createdTime: bet.createdTime,
        probAfter: bet.probAfter,
        probBefore: bet.probBefore,
        answerId: bet.answerId,
        userId: bet.userId,
        color,
        bets: [bet],
        contract,
        contractMetric,
      } as ChartPosition
    })
  }, [displayUser?.id, usersBets?.length])

  return {
    chartPositions,
    displayUser,
    setDisplayUser,
    hoveredChartPosition,
    setHoveredChartPosition,
  }
}

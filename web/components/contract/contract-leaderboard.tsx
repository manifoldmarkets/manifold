import { Bet } from 'common/bet'
import { getContractBetMetrics } from 'common/calculate'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'

import { groupBy, mapValues } from 'lodash'
import { Leaderboard } from '../leaderboard'
import { BETTORS } from 'common/user'
import { memo } from 'react'
import { HOUSE_BOT_USERNAME } from 'common/envs/constants'

export const ContractLeaderboard = memo(function ContractLeaderboard(props: {
  contract: Contract
  bets: Bet[]
}) {
  const { contract, bets } = props

  // Create a map of userIds to total profits (including sales)
  const betsByUser = groupBy(bets, 'userId')
  const userProfits = mapValues(betsByUser, (bets) => {
    const { profit } = getContractBetMetrics(contract, bets)
    return {
      name: bets[0].userName,
      username: bets[0].userUsername,
      avatarUrl: bets[0].userAvatarUrl,
      total: profit,
    }
  })
  // Find the 5 users with the most profits
  const top5 = Object.values(userProfits)
    .sort((p1, p2) => p2.total - p1.total)
    .filter((p) => p.total > 0)
    .filter((p) => p.username !== HOUSE_BOT_USERNAME)
    .slice(0, 5)

  return top5 && top5.length > 0 ? (
    <Leaderboard
      title={`🏅 Top ${BETTORS}`}
      entries={top5 || []}
      columns={[
        {
          header: 'Total profit',
          renderCell: (entry) => formatMoney(entry.total),
        },
      ]}
      className="mt-12 max-w-sm"
    />
  ) : null
})

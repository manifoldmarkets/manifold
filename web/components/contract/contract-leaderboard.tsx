import { formatMoney } from 'common/util/format'

import { Leaderboard } from '../leaderboard'
import { BETTORS, User } from 'common/user'
import { memo, useEffect, useState } from 'react'
import { ContractMetric } from 'common/contract-metric'
import { getProfitRankForContract } from 'web/lib/firebase/contract-metrics'
import { removeUndefinedProps } from 'common/util/object'
import { useUserContractMetric } from 'web/hooks/use-user-contract-metric'

export const ContractLeaderboard = memo(function ContractLeaderboard(props: {
  topContractMetrics: ContractMetric[]
  currentUser: User | undefined | null
  contractId: string
}) {
  const { topContractMetrics, currentUser, contractId } = props
  const topRankedUserIds = topContractMetrics.map((m) => m.userId)
  const currentUserMetrics = useUserContractMetric(currentUser?.id, contractId)
  const userIsAlreadyRanked =
    currentUser && topRankedUserIds.includes(currentUser.id)
  const [yourRank, setYourRank] = useState<number | undefined>(
    userIsAlreadyRanked
      ? topRankedUserIds.indexOf(currentUser.id) + 1
      : undefined
  )

  useEffect(() => {
    if (currentUserMetrics?.profit && !yourRank && !userIsAlreadyRanked) {
      getProfitRankForContract(currentUserMetrics.profit, contractId).then(
        (rank) => setYourRank(rank)
      )
    }
  }, [currentUserMetrics?.profit, yourRank, contractId, userIsAlreadyRanked])

  const allMetrics =
    currentUserMetrics && currentUser && !userIsAlreadyRanked
      ? [
          ...topContractMetrics.slice(0, 5),
          {
            ...currentUserMetrics,
            userName: currentUser.username,
            userId: currentUser.id,
            userAvatarUrl: currentUser.avatarUrl,
            userUsername: currentUser.username,
          } as ContractMetric,
        ]
      : topContractMetrics

  const userProfits = allMetrics.map((cm) => {
    const { profit } = cm
    return removeUndefinedProps({
      name: cm.userName,
      username: cm.userUsername,
      avatarUrl: cm.userAvatarUrl,
      total: profit,
      rank:
        cm.userId === currentUser?.id && yourRank
          ? yourRank
          : topContractMetrics.indexOf(cm) + 1,
    })
  })
  const top = Object.values(userProfits)
    .sort((a, b) => b.total - a.total)
    .filter((p) => p.total > 0)
    .slice(
      0,
      !currentUser || userIsAlreadyRanked || !currentUserMetrics ? 5 : 6
    )

  return top && top.length > 0 ? (
    <Leaderboard
      title={`🏅 Top ${BETTORS}`}
      entries={top || []}
      columns={[
        {
          header: 'Total profit',
          renderCell: (entry) => formatMoney(entry.total),
        },
      ]}
      className="mt-12 max-w-sm"
      highlightUsername={currentUser?.username}
    />
  ) : null
})

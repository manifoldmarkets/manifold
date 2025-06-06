import { formatWithToken } from 'common/util/format'

import { ContractMetric } from 'common/contract-metric'
import { getRanking } from 'common/supabase/contract-metrics'
import { BETTORS, User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { useEffect, useState } from 'react'
import { Leaderboard } from 'web/components/leaderboard'
import { db } from 'web/lib/supabase/db'

export function ContractLeaderboard(props: {
  topContractMetrics: ContractMetric[]
  currentUser: User | undefined | null
  contractId: string
  currentUserMetrics: ContractMetric | undefined
  isCashContract: boolean
}) {
  const {
    topContractMetrics,
    currentUser,
    contractId,
    currentUserMetrics,
    isCashContract,
  } = props
  const maxToShowMinusCurrentUser = 5
  const topRankedUserIds = topContractMetrics
    .slice(0, maxToShowMinusCurrentUser)
    .map((m) => m.userId)
  const userIsAlreadyRanked =
    currentUser && topRankedUserIds.includes(currentUser.id)
  // TODO: refactor all this to just work when this leaderboard is rendered (when market resolves)
  const [yourRank, setYourRank] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (currentUserMetrics?.profit && !yourRank && !userIsAlreadyRanked) {
      getRanking(contractId, currentUserMetrics.profit, db).then((rank) =>
        setYourRank(rank)
      )
    }
  }, [currentUserMetrics?.profit, yourRank, contractId, userIsAlreadyRanked])

  const allMetrics =
    currentUserMetrics && currentUser && !userIsAlreadyRanked
      ? [
          ...topContractMetrics.slice(0, maxToShowMinusCurrentUser),
          {
            ...currentUserMetrics,
            userName: currentUser.username,
            userId: currentUser.id,
            userAvatarUrl: currentUser.avatarUrl,
            userUsername: currentUser.username,
          } as ContractMetric,
        ]
      : topContractMetrics

  const userProfits = allMetrics
    // exclude house bot from question leaderboard
    .filter((cm) => cm.userName !== 'acc' || currentUser?.username === 'acc')
    .map((cm) => {
      const { profit } = cm
      return removeUndefinedProps({
        userId: cm.userId,
        name: cm.userName,
        username: cm.userUsername,
        avatarUrl: cm.userAvatarUrl,
        score: profit,
        rank:
          cm.userId === currentUser?.id && !userIsAlreadyRanked
            ? yourRank
              ? yourRank
              : maxToShowMinusCurrentUser + 1
            : topContractMetrics.indexOf(cm) + 1,
      })
    })
  const top = Object.values(userProfits)
    .sort((a, b) => b.score - a.score)
    .filter((p) => p.score > 0)
    .slice(
      0,
      !currentUser || userIsAlreadyRanked || !currentUserMetrics
        ? maxToShowMinusCurrentUser
        : maxToShowMinusCurrentUser + 1
    )

  return top && top.length > 0 ? (
    <Leaderboard
      title={`🏅 Top ${BETTORS}`}
      entries={top || []}
      columns={[
        {
          header: 'Total profit',
          renderCell: (entry) =>
            formatWithToken({
              amount: entry.score,
              token: isCashContract ? 'CASH' : 'M$',
            }),
        },
      ]}
      className="mt-12"
      highlightUserId={currentUser?.id}
    />
  ) : null
}

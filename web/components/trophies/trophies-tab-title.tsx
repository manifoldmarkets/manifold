import {
  countUnclaimedReachedMilestones,
  getTrophyDefinitionsFor,
} from 'common/trophies'
import { useUserAchievements } from 'web/hooks/use-user-achievements'
import { useUserTrophies } from 'web/hooks/use-user-trophies'
import { TrophyCountBubble } from './trophy-count-bubble'

export function TrophiesTabTitle(props: { userId: string }) {
  const { achievements } = useUserAchievements(props.userId)
  const { trophies } = useUserTrophies(props.userId, 'if-stale')
  const count =
    achievements && trophies
      ? countUnclaimedReachedMilestones(
          { ...achievements, ...trophies.starter },
          trophies.claims,
          getTrophyDefinitionsFor(!!trophies.starter)
        )
      : 0
  return (
    <span className="inline-flex items-center gap-1">
      Trophies <TrophyCountBubble count={count} />
    </span>
  )
}

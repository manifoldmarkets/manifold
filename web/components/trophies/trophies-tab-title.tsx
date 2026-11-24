import { useClaimableTrophies } from 'web/hooks/use-claimable-trophies'
import { TrophyCountBubble } from './trophy-count-bubble'

export function TrophiesTabTitle() {
  const { ready } = useClaimableTrophies()
  return (
    <span className="inline-flex items-center gap-1">
      Trophies <TrophyCountBubble count={ready.length} />
    </span>
  )
}

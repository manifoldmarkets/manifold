import { useState } from 'react'
import clsx from 'clsx'

import {
  TrophyMilestone,
  TrophyRankTier,
  getTrophyBadgeImagePath,
  getTrophyRankBadgeImagePath,
} from 'common/trophies'

// A milestone's badge art, drawn on a transparent background to sit on the
// tier-coloured circle around it. Falls back to the milestone's emoji if the
// image can't load (e.g. a new milestone without art yet). With a held rank
// tier, shows that tier's pin (Super, Mega or #1) instead.
export function TrophyBadgeImage(props: {
  trophyId: string
  milestone: TrophyMilestone
  rankTier?: TrophyRankTier | null
  className?: string // size the image with this
  emojiClassName?: string // size the fallback emoji with this
}) {
  const { trophyId, milestone, rankTier, className, emojiClassName } = props
  const src = rankTier
    ? getTrophyRankBadgeImagePath(trophyId, rankTier)
    : getTrophyBadgeImagePath(trophyId, milestone.id)
  // Keyed by the image, so moving to another milestone tries its image again.
  return (
    <BadgeImage
      key={src}
      src={src}
      emoji={milestone.emoji}
      className={className}
      emojiClassName={emojiClassName}
    />
  )
}

function BadgeImage(props: {
  src: string
  emoji: string
  className?: string
  emojiClassName?: string
}) {
  const { src, emoji, className, emojiClassName } = props
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className={emojiClassName} aria-hidden>
        {emoji}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      decoding="async"
      className={clsx('select-none object-contain', className)}
      onError={() => setFailed(true)}
    />
  )
}

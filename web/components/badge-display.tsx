import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { getBadgesByRarity } from 'common/badge'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { BadgesModal } from 'web/components/profile/badges-modal'
import { ParsedUrlQuery } from 'querystring'

export const goldClassName = 'text-amber-400'
export const silverClassName = 'text-gray-500'
export const bronzeClassName = 'text-amber-900'

export function BadgeDisplay(props: {
  user: User | undefined | null
  query: ParsedUrlQuery
}) {
  const { user, query } = props
  const [showBadgesModal, setShowBadgesModal] = useState(false)

  useEffect(() => {
    const showBadgesModal = query['show'] == 'badges'
    setShowBadgesModal(showBadgesModal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // get number of badges of each rarity type
  const badgesByRarity = getBadgesByRarity(user)
  const badgesByRarityItems = Object.entries(badgesByRarity).map(
    ([rarity, numBadges]) => {
      return (
        <Row
          key={rarity}
          className={clsx(
            'items-center gap-2',
            rarity === 'bronze'
              ? bronzeClassName
              : rarity === 'silver'
              ? silverClassName
              : goldClassName
          )}
        >
          <span className={clsx('-m-0.5 text-lg')}>•</span>
          <span className="text-xs">{numBadges}</span>
        </Row>
      )
    }
  )
  return (
    <Row
      className={'cursor-pointer gap-2'}
      onClick={() => setShowBadgesModal(true)}
    >
      {badgesByRarityItems}
      {user && (
        <BadgesModal
          isOpen={showBadgesModal}
          setOpen={setShowBadgesModal}
          user={user}
        />
      )}
    </Row>
  )
}

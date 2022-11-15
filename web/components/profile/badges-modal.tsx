import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { PAST_BETS, User } from 'common/user'
import clsx from 'clsx'
import {
  Badge,
  calculateBadgeRarity,
  MarketCreatorBadge,
  ProvenCorrectBadge,
  rarities,
  StreakerBadge,
} from 'common/badge'
import { groupBy } from 'lodash'
import { Row } from 'web/components/layout/row'
import { SiteLink } from 'web/components/widgets/site-link'
import { contractPathWithoutContract } from 'web/lib/firebase/contracts'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  bronzeClassName,
  goldClassName,
  silverClassName,
} from 'web/components/badge-display'
import { formatMoney } from 'common/util/format'

export function BadgesModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
  user: User
}) {
  const { isOpen, setOpen, user } = props
  const { provenCorrect, marketCreator, streaker } = user.achievements ?? {}
  const badges = [
    ...(provenCorrect?.badges ?? []),
    ...(streaker?.badges ?? []),
    ...(marketCreator?.badges ?? []),
  ]

  // group badges by their rarities
  const badgesByRarity = groupBy(badges, (badge) => calculateBadgeRarity(badge))

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="items-center gap-4 rounded-md bg-white px-8 py-6">
        <span className={clsx('text-8xl')}>🏅</span>
        <span className="text-xl">{user.name + "'s"} badges</span>

        <Row className={'flex-wrap gap-2'}>
          <Col
            className={clsx(
              'min-w-full gap-2 rounded-md border-2 border-amber-900 border-opacity-40 p-2 text-center'
            )}
          >
            <span className={clsx(' ', bronzeClassName)}>Bronze</span>
            <Row className={'flex-wrap justify-center gap-4'}>
              {badgesByRarity['bronze'] ? (
                badgesByRarity['bronze'].map((badge, i) => (
                  <BadgeToItem badge={badge} key={i} rarity={'bronze'} />
                ))
              ) : (
                <span className={'text-gray-500'}>None yet</span>
              )}
            </Row>
          </Col>
          <Col
            className={clsx(
              'min-w-full gap-2 rounded-md border-2 border-gray-500 border-opacity-40 p-2 text-center '
            )}
          >
            <span className={clsx(' ', silverClassName)}>Silver</span>
            <Row className={'flex-wrap justify-center gap-4'}>
              {badgesByRarity['silver'] ? (
                badgesByRarity['silver'].map((badge, i) => (
                  <BadgeToItem badge={badge} key={i} rarity={'silver'} />
                ))
              ) : (
                <span className={'text-gray-500'}>None yet</span>
              )}
            </Row>
          </Col>
          <Col
            className={clsx(
              'min-w-full gap-2 rounded-md border-2 border-amber-400  p-2 text-center '
            )}
          >
            <span className={clsx('', goldClassName)}>Gold</span>
            <Row className={'flex-wrap justify-center gap-4'}>
              {badgesByRarity['gold'] ? (
                badgesByRarity['gold'].map((badge, i) => (
                  <BadgeToItem badge={badge} key={i} rarity={'gold'} />
                ))
              ) : (
                <span className={'text-gray-500'}>None yet</span>
              )}
            </Row>
          </Col>
        </Row>
      </Col>
    </Modal>
  )
}

function BadgeToItem(props: { badge: Badge; rarity: rarities }) {
  const { badge, rarity } = props
  if (badge.type === 'PROVEN_CORRECT')
    return (
      <ProvenCorrectBadgeItem
        badge={badge as ProvenCorrectBadge}
        rarity={rarity}
      />
    )
  else if (badge.type === 'STREAKER')
    return <StreakerBadgeItem badge={badge as StreakerBadge} rarity={rarity} />
  else if (badge.type === 'MARKET_CREATOR')
    return (
      <MarketCreatorBadgeItem
        badge={badge as MarketCreatorBadge}
        rarity={rarity}
      />
    )
  else return null
}

function ProvenCorrectBadgeItem(props: {
  badge: ProvenCorrectBadge
  rarity: rarities
}) {
  const { badge, rarity } = props
  const { betAmount, contractSlug, contractCreatorUsername, profit } =
    badge.data
  return (
    <SiteLink
      href={contractPathWithoutContract(contractCreatorUsername, contractSlug)}
    >
      <Col className={'text-center'}>
        <Medal rarity={rarity} />
        <Tooltip
          text={
            `Make a comment attached to a winning bet ` +
            (profit
              ? `with ${formatMoney(profit)} profit`
              : `worth ${formatMoney(betAmount)}`)
          }
        >
          <span
            className={
              rarity === 'gold'
                ? goldClassName
                : rarity === 'silver'
                ? silverClassName
                : bronzeClassName
            }
          >
            Proven Correct
          </span>
        </Tooltip>
      </Col>
    </SiteLink>
  )
}
function StreakerBadgeItem(props: { badge: StreakerBadge; rarity: rarities }) {
  const { badge, rarity } = props
  const { totalBettingStreak } = badge.data
  return (
    <Col className={'cursor-default text-center'}>
      <Medal rarity={rarity} />
      <Tooltip
        text={`Make ${PAST_BETS} ${totalBettingStreak} day${
          totalBettingStreak > 1 ? 's' : ''
        } in a row`}
      >
        <span
          className={
            rarity === 'gold'
              ? goldClassName
              : rarity === 'silver'
              ? silverClassName
              : bronzeClassName
          }
        >
          Prediction Streak
        </span>
      </Tooltip>
    </Col>
  )
}
function MarketCreatorBadgeItem(props: {
  badge: MarketCreatorBadge
  rarity: rarities
}) {
  const { badge, rarity } = props
  const { totalContractsCreated } = badge.data
  return (
    <Col className={'cursor-default text-center'}>
      <Medal rarity={rarity} />
      <Tooltip
        text={`Make ${totalContractsCreated} market${
          totalContractsCreated > 1 ? 's' : ''
        }`}
      >
        <span
          className={
            rarity === 'gold'
              ? goldClassName
              : rarity === 'silver'
              ? silverClassName
              : bronzeClassName
          }
        >
          Market Creator
        </span>
      </Tooltip>
    </Col>
  )
}
function Medal(props: { rarity: rarities }) {
  const { rarity } = props
  return (
    <span
      className={
        rarity === 'gold'
          ? goldClassName
          : rarity === 'silver'
          ? silverClassName
          : bronzeClassName
      }
    >
      {rarity === 'gold' ? '🥇' : rarity === 'silver' ? '🥈' : '🥉'}
    </span>
  )
}

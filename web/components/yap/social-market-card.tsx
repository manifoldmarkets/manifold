import clsx from 'clsx'
import { capitalize } from 'lodash'
import Link from 'next/link'
import { ReactNode, useState } from 'react'

import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
  getBinaryProbPercent,
  isMultiCpmm,
  PollContract,
  StonkContract,
} from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { useLiveContractWithStatus } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { MultiBetDialog } from '../bet/bet-dialog'
import { BetButton } from '../bet/feed-bet-button'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { PollPanel } from '../poll/poll-panel'
import { SocialAvatar } from './social-avatar'

export function SocialMarketCard(props: { market: Contract }) {
  const { market } = props
  // Once live, a card stays live: the live close time can extend past the
  // one in the post's snapshot. A refreshed post can still make it live.
  const actionable = !!getSocialMarketAction(market, Date.now())
  const [live, setLive] = useState(actionable)
  if (actionable && !live) setLive(true)
  return live ? (
    <LiveSocialMarketCard market={market} />
  ) : (
    <SocialMarketFrame market={market} />
  )
}

// The analytics location of bets placed from a market on a Yap post.
export const YAP_BET_LOCATION = 'yap'

export type SocialMarketAction = 'binary' | 'stonk' | 'multi' | 'poll'

// What a reader can do with a market on a Yap post without leaving the feed.
// Other market types, and markets that are closed or resolved, only link out.
export const getSocialMarketAction = (
  market: Contract,
  now: number
): SocialMarketAction | undefined => {
  if (market.isResolved) return undefined
  if (market.closeTime && market.closeTime <= now) return undefined
  if (market.outcomeType === 'POLL') return 'poll'
  if (market.outcomeType === 'BINARY' && market.mechanism === 'cpmm-1')
    return 'binary'
  if (market.outcomeType === 'STONK') return 'stonk'
  if (isMultiCpmm(market)) return 'multi'
  return undefined
}

function LiveSocialMarketCard(props: { market: Contract }) {
  // The post's copy can be up to 30 seconds old and has no answers for
  // multiple choice markets. The live fetch includes their answers.
  const { contract: market, hasLoaded } = useLiveContractWithStatus(
    props.market
  )
  // Yap reads hide attachments that stop being public; the live fetch doesn't.
  if (market.visibility !== 'public' || market.deleted)
    return <SocialMarketFrame market={props.market} />

  const action = getSocialMarketAction(market, Date.now())
  const actions = action && (
    <SocialMarketActions
      market={market}
      action={action}
      hasLoaded={hasLoaded}
    />
  )
  // Bet buttons fit under the chance on the right, so they add little
  // height. A poll's options need the card's full width.
  return action === 'poll' ? (
    <SocialMarketFrame market={market} below={actions} />
  ) : (
    <SocialMarketFrame market={market} side={actions} />
  )
}

function SocialMarketFrame(props: {
  market: Contract
  side?: ReactNode
  below?: ReactNode
}) {
  const { market, side, below } = props
  const rowClass =
    'hover:bg-canvas-50 flex items-center justify-between gap-3 px-3 py-3 transition-colors'
  const border = 'border-ink-200 dark:border-ink-300 rounded-xl border'
  if (!side && !below)
    return (
      <Link
        href={contractPath(market)}
        className={clsx(rowClass, border, 'hover:border-primary-400')}
      >
        <SocialMarketTitle market={market} />
        <SocialMarketChip market={market} />
      </Link>
    )
  // Buttons can't sit inside a link. The link's ::after covers the row
  // instead, so the chip and the space around the buttons still open the
  // market; the buttons sit above it. data-social-market keeps clicks
  // between buttons from opening the post's discussion, as the post card
  // does for clicks outside links.
  return (
    <div className={clsx(border, 'overflow-hidden')} data-social-market>
      <div className={clsx(rowClass, 'relative')}>
        <Link
          href={contractPath(market)}
          className="min-w-0 flex-1 after:absolute after:inset-0"
        >
          <SocialMarketTitle market={market} />
        </Link>
        <Col className="shrink-0 items-end gap-2">
          <SocialMarketChip market={market} />
          {side && <div className="relative">{side}</div>}
        </Col>
      </div>
      {below && <div className="px-3 pb-3">{below}</div>}
    </div>
  )
}

function SocialMarketTitle(props: { market: Contract }) {
  const { market } = props
  return (
    <span className="min-w-0 flex-1">
      <span className="text-ink-900 block break-words text-sm font-medium leading-snug [overflow-wrap:anywhere]">
        {market.question}
      </span>
      <span className="text-ink-600 mt-1.5 flex min-w-0 items-center gap-1.5 text-xs">
        <SocialAvatar
          user={{
            id: market.creatorId,
            username: market.creatorUsername,
            avatarUrl: market.creatorAvatarUrl,
          }}
          size="2xs"
          noLink
        />
        <span className="truncate">{market.creatorName}</span>
      </span>
    </span>
  )
}

function SocialMarketChip(props: { market: Contract }) {
  const { market } = props
  return (
    <span className="bg-primary-500/10 text-primary-700 shrink-0 rounded-md px-2 py-1 text-sm font-semibold tabular-nums">
      {market.isResolved && market.resolution && (
        <span className="sr-only">Resolved: </span>
      )}
      {market.isResolved
        ? market.resolution ?? 'Resolved'
        : market.outcomeType === 'BINARY'
        ? getBinaryProbPercent(market)
        : 'View market'}
      {market.outcomeType === 'BINARY' && !market.isResolved && (
        <span className="sr-only"> chance</span>
      )}
    </span>
  )
}

function SocialMarketActions(props: {
  market: Contract
  action: SocialMarketAction
  hasLoaded: boolean
}) {
  const { market, action, hasLoaded } = props
  const user = useUser()
  if (action === 'poll')
    return <PollPanel contract={market as PollContract} maxOptions={4} />
  if (action === 'multi')
    return (
      <SocialMultiBetButton
        contract={market as CPMMMultiContract}
        hasLoaded={hasLoaded}
      />
    )
  return (
    <BetButton
      contract={market as BinaryContract | StonkContract}
      user={user}
      location={YAP_BET_LOCATION}
      questionTitle={market.question}
      labels={action === 'stonk' ? { yes: 'Buy', no: 'Short' } : undefined}
      // Phones stack the two buttons so the question keeps its width.
      className="flex flex-col gap-1.5 sm:flex-row sm:gap-2 [&>button]:m-0"
    />
  )
}

function SocialMultiBetButton(props: {
  contract: CPMMMultiContract
  hasLoaded: boolean
}) {
  const { contract, hasLoaded } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  // Live updates can supply a partial answer list before the fetch finishes.
  const loaded = hasLoaded && Array.isArray(contract.answers)
  return (
    <>
      <Button
        size="xs"
        color="indigo-outline"
        disabled={!loaded}
        aria-label={`${capitalize(TRADE_TERM)} on ${contract.question}`}
        aria-haspopup="dialog"
        onClick={() => {
          if (!user) {
            // A closed or blocked sign-in window rejects. That is an
            // ordinary outcome here, not an error to surface.
            firebaseLogin().catch(() => undefined)
            return
          }
          track('bet intent', {
            location: YAP_BET_LOCATION,
            token: contract.token,
            contractId: contract.id,
          })
          setOpen(true)
        }}
      >
        {capitalize(TRADE_TERM)}
      </Button>
      {open && loaded && (
        <MultiBetDialog
          contract={contract}
          open={open}
          setOpen={setOpen}
          trackingLocation={YAP_BET_LOCATION}
        />
      )}
    </>
  )
}

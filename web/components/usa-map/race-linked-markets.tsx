import { useMemo, useState } from 'react'
import { capitalize, maxBy } from 'lodash'
import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
  isMultiCpmm,
} from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import {
  MARKET_LINK_RELATION_LABELS,
  MarketLinkRelation,
} from 'common/market-links'
import { BetDialog, MultiBetDialog } from 'web/components/bet/bet-dialog'
import { Button } from 'web/components/buttons/button'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useLiveContract } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { formatOdds, plural } from './election-display'
import type { Race } from './election-map-model'
import { useMarketLink } from './market-link'
import {
  createLinkedMarketHref,
  linkedRaceParent,
  openLinkedChildren,
} from './race-linked-markets-model'
import styles from './election-explorer.module.css'

// `markets-by-ids` takes at most this many; a parent lists at most 50.
const MAX_LISTED = 100

/** "3 linked markets" on a hovered race, from the page's preloaded counts. */
export function LinkedMarketsBadge(props: { count?: number }) {
  const { count } = props
  if (!count) return null
  return (
    <span className={styles.linkedBadge}>{plural(count, 'linked market')}</span>
  )
}

/**
 * The markets linked to a race's market (common/market-links): props and
 * lines, under the race's details. Closed by default. `expectedCount` is the
 * page's preloaded count (at most a minute old), so the section and its count
 * show the moment a race is pinned; the list is read then, and the contracts
 * with their live prices load when it is opened. Nothing renders for a race
 * without links, or for a district priced only by a shared portfolio answer,
 * which has no market of its own to link to.
 */
export function RaceLinkedMarkets(props: {
  race: Race
  expectedCount?: number
}) {
  const { race, expectedCount = 0 } = props
  const parent = linkedRaceParent(race)
  const parentId = parent?.id
  // The in-memory data slot is per parent, so a newly selected race never
  // shows the previous race's list.
  const links = useAPIGetter(
    'get-market-links',
    parentId ? { contractId: parentId } : undefined,
    undefined,
    parentId && `election-links-${parentId}`,
    !!parentId
  )
  const children = useMemo(
    () =>
      parentId && links.data
        ? openLinkedChildren(links.data.children, parentId).slice(0, MAX_LISTED)
        : undefined,
    [links.data, parentId]
  )
  const count = children ? children.length : expectedCount
  const [open, setOpen] = useState(false)
  if (!parent || count === 0) return null
  return (
    <details
      className={styles.linked}
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open
        setOpen(next)
        if (next)
          track('election linked markets open', { raceId: race.id, count })
      }}
    >
      <summary aria-label={`Linked markets for ${race.label}`}>
        <span className={styles.eyebrow}>Linked markets</span>
        <span className={styles.linkedCount}>{count}</span>
      </summary>
      {open &&
        (links.error && !links.data ? (
          <LoadError refresh={links.refresh} />
        ) : !children ? (
          <p className={styles.note} role="status">
            Loading linked markets…
          </p>
        ) : (
          <>
            <LinkedMarketList race={race} refs={children} />
            <AddLinkedMarket race={race} parent={parent} />
          </>
        ))}
    </details>
  )
}

function LoadError(props: { refresh: () => unknown }) {
  return (
    <p className={styles.note} role="alert">
      Couldn't load these markets.{' '}
      <button
        className={styles.linkedRetry}
        onClick={() => void props.refresh()}
      >
        Retry
      </button>
    </p>
  )
}

function LinkedMarketList(props: {
  race: Race
  refs: { id: string; relation: MarketLinkRelation }[]
}) {
  const { race, refs } = props
  const ids = refs.map((ref) => ref.id)
  const { data, error, refresh } = useAPIGetter(
    'markets-by-ids',
    { ids },
    undefined,
    `election-linked-markets-${race.id}`
  )
  const byId = useMemo(
    () => new Map((data ?? []).map((c) => [c.id, c])),
    [data]
  )
  if (error && !data) return <LoadError refresh={refresh} />
  if (!data)
    return (
      <p className={styles.note} role="status">
        Loading linked markets…
      </p>
    )
  const rows = refs.filter((ref) => {
    const contract = byId.get(ref.id)
    return !!contract && isListable(contract)
  })
  if (rows.length === 0)
    return <p className={styles.note}>No available linked markets.</p>
  return (
    <div className={styles.linkedList}>
      {rows.map((ref) => (
        <LinkedMarketRow
          key={ref.id}
          contract={byId.get(ref.id)!}
          relation={ref.relation}
        />
      ))}
    </div>
  )
}

const isOpen = (contract: Contract) =>
  !contract.isResolved &&
  (contract.closeTime == null || contract.closeTime > Date.now())

// The link list is cached for the session; a child can resolve or be hidden
// before the section is opened. Judge it by the contract just fetched.
const isListable = (contract: Contract) =>
  !contract.isResolved &&
  !contract.deleted &&
  (contract.visibility ?? 'public') === 'public'

// One linked market: its question (a link to its page), who made it and how
// many trade it, its price or status, and a Bet button for binary and
// multiple choice markets. Polls and other types link to their page.
function LinkedMarketRow(props: {
  contract: Contract
  relation: MarketLinkRelation
}) {
  const { relation } = props
  const contract = useLiveContract(props.contract)
  const user = useUser()
  const { newTab, linkProps } = useMarketLink()
  const [betting, setBetting] = useState(false)
  const isBinary =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'cpmm-1'
  const multi = isMultiCpmm(contract)
    ? (contract as CPMMMultiContract)
    : undefined
  // An independent market can hold resolved answers while it stays open; a
  // resolved YES would otherwise read as a 100% live quote.
  const leader = multi
    ? maxBy(
        multi.answers.filter((a) => !a.resolution),
        (a) => getAnswerProbability(multi, a.id)
      )
    : undefined
  const quote = isBinary
    ? formatOdds(getDisplayProbability(contract as BinaryContract))
    : multi && leader
    ? `${leader.text} ${formatOdds(getAnswerProbability(multi, leader.id))}`
    : undefined
  const status = contract.isResolved
    ? `Resolved ${contract.resolution ?? ''}`.trim()
    : !isOpen(contract)
    ? 'Closed'
    : undefined
  const canBet = isOpen(contract) && (isBinary || !!multi)
  const bet = () => {
    if (!user) return firebaseLogin()
    track('bet intent', { location: 'election map linked market' })
    setBetting(true)
  }
  return (
    <div className={styles.linkedRow}>
      <a
        className={styles.linkedQuestion}
        href={contractPath(contract)}
        {...linkProps}
      >
        {contract.question}
        {newTab && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
      <div className={styles.linkedMeta}>
        <span className={styles.linkedRelation}>
          {MARKET_LINK_RELATION_LABELS[relation]}
        </span>
        <span>@{contract.creatorUsername}</span>
        <span>{plural(contract.uniqueBettorCount, 'trader')}</span>
        {(status || quote) && (
          <span className={styles.linkedQuote}>{status ?? quote}</span>
        )}
        {canBet && (
          <Button
            size="2xs"
            color="indigo-outline"
            className="bg-primary-50"
            aria-label={`${capitalize(TRADE_TERM)} on ${contract.question}`}
            aria-haspopup="dialog"
            onClick={bet}
          >
            {capitalize(TRADE_TERM)}
          </Button>
        )}
      </div>
      {betting && isBinary && (
        <BetDialog
          contract={contract as BinaryContract}
          open
          setOpen={(open) => !open && setBetting(false)}
          trackingLocation="election map linked market"
        />
      )}
      {betting && multi && (
        <MultiBetDialog
          contract={multi}
          open
          setOpen={(open) => !open && setBetting(false)}
        />
      )}
    </div>
  )
}

function AddLinkedMarket(props: { race: Race; parent: Contract }) {
  const { race, parent } = props
  const { newTab, linkProps } = useMarketLink()
  return (
    <a
      className={styles.chartLink}
      href={createLinkedMarketHref(race, parent)}
      {...linkProps}
      onClick={() =>
        track('election create linked market', {
          raceId: race.id,
          contractId: parent.id,
        })
      }
    >
      Add a market →
      {newTab && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  )
}

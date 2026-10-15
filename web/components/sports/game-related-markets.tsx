import { ChevronDownIcon, PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Contract,
  contractPath,
  BinaryContract,
  CPMMMultiContract,
  isBinaryMulti,
  isMultiCpmm,
} from 'common/contract'
import {
  RelatedGroup,
  ScheduleGame,
  SPORT_BY_KEY,
} from 'common/sports-schedule'
import { removeEmojis } from 'common/util/string'
import { shortFormatNumber } from 'common/util/format'
import { BetButton } from 'web/components/bet/feed-bet-button'
import { MultiBetDialog } from 'web/components/bet/bet-dialog'
import { Button } from 'web/components/buttons/button'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useLiveContract } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import {
  isOfficialSportsMarket,
  SportsMarketBadge,
} from './sports-market-badge'

const INITIAL_ROWS = 3
const HERO_PREVIEW_ROWS = 2
// Lines first, then props, then whatever else names the teams.
const GROUP_ORDER: RelatedGroup[] = ['game-lines', 'props', 'community']

/**
 * The markets on a game, under its card on the sport page. Today the list is
 * the schedule's matching: official lines and props by event id, and
 * community markets that name both teams near kickoff. Markets linked to a
 * game will go here too. Warm the first three rows near the viewport;
 * remaining markets load only when requested. Live rows mount only for the
 * hero preview or an open section.
 */
export function GameLinkedMarkets(props: {
  game: ScheduleGame
  /** The hero's scoreboard, beside a small always-visible market preview. */
  matchup?: ReactNode
}) {
  const { game, matchup } = props
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const [showAll, setShowAll] = useState(false)
  const [nearby, setNearby] = useState(false)
  const disclosureRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (nearby || !disclosureRef.current) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearby(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px' }
    )
    observer.observe(disclosureRef.current)
    return () => observer.disconnect()
  }, [nearby])
  const ordered = useMemo(
    () =>
      GROUP_ORDER.flatMap((group) =>
        game.related.filter((r) => r.group === group)
      ),
    [game.related]
  )
  const ids = ordered.map((r) => r.id)
  const featured = !!matchup && ids.length > 0
  const firstIds = ids.slice(0, INITIAL_ROWS)
  const remainingIds = ids.slice(INITIAL_ROWS)
  // The existing request cache deduplicates hover, focus, scrolling, and
  // reopening. Keep the preview separate so Show more never clears it.
  const preview = useAPIGetter(
    'markets-by-ids',
    { ids: firstIds },
    undefined,
    `sports-related-${game.id}-preview`,
    firstIds.length > 0 && (nearby || expanded)
  )
  const rest = useAPIGetter(
    'markets-by-ids',
    { ids: remainingIds },
    undefined,
    `sports-related-${game.id}-rest`,
    remainingIds.length > 0 && expanded && (featured || showAll)
  )
  const contracts = useMemo(() => {
    if (!preview.data) return undefined
    const byId = new Map(
      [...preview.data, ...(rest.data ?? [])].map((c) => [c.id, c])
    )
    return (featured || showAll ? ids : firstIds)
      .map((id) => byId.get(id))
      .filter((c): c is Contract => !!c)
  }, [preview.data, rest.data, ids.join(','), showAll, featured])
  const loadingPreview = firstIds.length > 0 && !preview.data && !preview.error
  const loadingRest =
    (featured || showAll) &&
    expanded &&
    remainingIds.length > 0 &&
    !rest.data &&
    !rest.error

  const addMarket = (
    <Link
      href={createMarketHref(game)}
      onClick={() =>
        track('sports create related market', { contractId: game.id })
      }
      className="text-ink-500 hover:text-primary-700 focus-visible:ring-primary-500 flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-4 text-xs font-medium focus-visible:ring-2"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      Add a market
    </Link>
  )

  if (featured) {
    const sidebarIds = ids.slice(0, HERO_PREVIEW_ROWS)
    const sidebarMarkets = contracts?.filter((c) => sidebarIds.includes(c.id))
    const moreMarkets = contracts?.filter((c) => !sidebarIds.includes(c.id))
    const moreCount = ids.length - sidebarIds.length
    return (
      <div
        ref={disclosureRef}
        onPointerEnter={() => setNearby(true)}
        onFocusCapture={() => setNearby(true)}
      >
        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {matchup}
          <div className="border-primary-200 bg-canvas-0/40 min-w-0 border-t px-4 pb-2 lg:border-l lg:border-t-0">
            <Row className="min-h-[44px] items-center justify-between gap-2">
              <h3 className="text-ink-600 text-xs font-semibold">
                Props & more
              </h3>
              {addMarket}
            </Row>
            <div aria-busy={loadingPreview}>
              {preview.error && !preview.data ? (
                <MarketLoadError refresh={preview.refresh} />
              ) : !sidebarMarkets ? (
                <PropsSkeleton count={sidebarIds.length} />
              ) : sidebarMarkets.length === 0 ? (
                <p className="text-ink-500 py-2 text-xs">
                  No available linked markets.
                </p>
              ) : (
                <Col className="divide-ink-200 divide-y">
                  {sidebarMarkets.map((c) => (
                    <RelatedMarketRow key={c.id} contract={c} layout="prop" />
                  ))}
                </Col>
              )}
            </div>
          </div>
        </div>
        {moreCount > 0 && (
          <div className="border-primary-200 border-t">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              aria-label={`More props & markets for ${game.home.name} vs ${game.away.name}`}
              onClick={() => setExpanded((value) => !value)}
              className="text-ink-600 hover:bg-primary-100 focus-visible:ring-primary-500 flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-xs font-semibold focus-visible:ring-2"
            >
              <ChevronDownIcon
                className={clsx(
                  'h-4 w-4 transition-transform',
                  expanded && 'rotate-180'
                )}
              />
              {expanded
                ? 'Fewer markets'
                : `${moreCount} more ${moreCount === 1 ? 'market' : 'markets'}`}
            </button>
            <div
              id={panelId}
              hidden={!expanded}
              aria-busy={loadingPreview || loadingRest}
              className="bg-canvas-50 px-4 pb-2"
            >
              {expanded && (
                <div className="grid gap-x-6 lg:grid-cols-2">
                  {moreMarkets?.map((c) => (
                    <div
                      key={c.id}
                      className="border-ink-200 min-w-0 border-b last:border-b-0"
                    >
                      <RelatedMarketRow contract={c} layout="prop" />
                    </div>
                  ))}
                  {loadingPreview && (
                    <PropsSkeleton
                      count={Math.min(
                        moreCount,
                        INITIAL_ROWS - HERO_PREVIEW_ROWS
                      )}
                    />
                  )}
                  {loadingRest && (
                    <PropsSkeleton
                      count={Math.min(remainingIds.length, INITIAL_ROWS)}
                    />
                  )}
                  {rest.error && <MarketLoadError refresh={rest.refresh} />}
                  {!loadingPreview &&
                    !loadingRest &&
                    !preview.error &&
                    !rest.error &&
                    moreMarkets?.length === 0 && (
                      <p className="text-ink-500 py-2 text-xs">
                        No more available linked markets.
                      </p>
                    )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={disclosureRef}
      onPointerEnter={() => setNearby(true)}
      onFocusCapture={() => setNearby(true)}
      className={clsx('border-ink-100 rounded-b-xl', !matchup && 'border-t')}
    >
      {matchup}
      <Row
        className={clsx('items-center', matchup && 'border-ink-100 border-t')}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`Props & more for ${game.home.name} vs ${game.away.name}`}
          onClick={() => setExpanded((value) => !value)}
          className="text-ink-600 hover:bg-canvas-50 focus-visible:ring-primary-500 flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-b-xl px-4 text-left text-xs font-semibold focus-visible:ring-2"
        >
          <ChevronDownIcon
            className={clsx(
              'h-4 w-4 transition-transform',
              expanded && 'rotate-180'
            )}
          />
          Props & more
          <span className="bg-canvas-100 text-ink-500 rounded px-1.5 py-0.5 tabular-nums">
            {ids.length}
          </span>
          {!expanded && (
            <span className="text-ink-400 ml-auto font-normal">Explore</span>
          )}
        </button>
        {expanded && addMarket}
      </Row>
      <div
        id={panelId}
        hidden={!expanded}
        aria-busy={loadingPreview || loadingRest}
        className="bg-canvas-50 rounded-b-xl px-4 pb-1"
      >
        {expanded && (
          <>
            {ids.length === 0 ? (
              <p className="text-ink-500 py-3 text-sm">
                No linked markets yet.
              </p>
            ) : preview.error && !preview.data ? (
              <p className="text-ink-500 py-2 text-xs" role="alert">
                Couldn't load these markets.
                <button
                  type="button"
                  onClick={() => void preview.refresh()}
                  className="text-primary-700 ml-2 underline"
                >
                  Retry
                </button>
              </p>
            ) : contracts === undefined ? (
              <PropsSkeleton count={firstIds.length} />
            ) : (
              <Col className="divide-ink-200 divide-y">
                {contracts.map((c) => (
                  <RelatedMarketRow key={c.id} contract={c} layout="prop" />
                ))}
                {contracts.length === 0 && !loadingRest && (
                  <p className="text-ink-500 py-2 text-xs">
                    No available linked markets.
                  </p>
                )}
                {loadingRest && (
                  <PropsSkeleton
                    count={Math.min(remainingIds.length, INITIAL_ROWS)}
                  />
                )}
                {showAll && rest.error && (
                  <p className="text-ink-500 py-2 text-xs" role="alert">
                    Couldn't load more markets.
                    <button
                      type="button"
                      onClick={() => void rest.refresh()}
                      className="text-primary-700 ml-2 underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
                {remainingIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAll((value) => !value)}
                    className="text-primary-700 hover:bg-canvas-50 w-full px-2.5 py-1.5 text-left text-xs font-medium"
                  >
                    {showAll
                      ? 'Show fewer'
                      : `Show ${remainingIds.length} more`}
                  </button>
                )}
              </Col>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MarketLoadError({ refresh }: { refresh: () => unknown }) {
  return (
    <p className="text-ink-500 py-2 text-xs" role="alert">
      Couldn't load these markets.
      <button
        type="button"
        onClick={() => void refresh()}
        className="text-primary-700 ml-2 underline"
      >
        Retry
      </button>
    </p>
  )
}

function PropsSkeleton({ count }: { count: number }) {
  return (
    <Col role="status" className="divide-ink-200 divide-y">
      <span className="sr-only">Loading props</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden className="animate-pulse space-y-2 py-2">
          <div className="bg-ink-100 h-4 w-5/6 rounded" />
          <div className="flex items-center justify-between gap-3">
            <div className="bg-ink-100 h-3 w-1/3 rounded" />
            <div className="bg-ink-100 h-8 w-32 rounded" />
          </div>
        </div>
      ))}
    </Col>
  )
}

// /create reads its prefill from a JSON `params` query value. `rand` makes
// it replace a draft the form saved earlier, and is what applies the topic
// slugs (the same as duplicating a market).
function createMarketHref(game: ScheduleGame) {
  const slug = SPORT_BY_KEY[game.sport]?.slug
  const params = {
    q: `${game.question.replace(/\s*\[official\]\s*$/i, '')}: `,
    description: '',
    closeTime: game.closeTime,
    visibility: 'public',
    groupSlugs: slug ? [slug] : undefined,
    rand: game.id.slice(0, 6),
  }
  return `/create?params=${encodeURIComponent(JSON.stringify(params))}`
}

/** A market row, with the question above compact actions inside a game. */
export function RelatedMarketRow(props: {
  contract: Contract
  /** Rendered before the question: a time, a sport tag. */
  prefix?: React.ReactNode
  layout?: 'row' | 'prop'
}) {
  const { prefix, layout = 'row' } = props
  const isProp = layout === 'prop'
  const contract = useLiveContract(props.contract)
  const official = isOfficialSportsMarket(contract)
  const user = useUser()
  const [betOpen, setBetOpen] = useState(false)
  const isBinary =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'cpmm-1'
  const isMulti = isMultiCpmm(contract)
  const closed =
    !!contract.resolution ||
    (!!contract.closeTime && contract.closeTime < Date.now())

  const previewAnswers =
    isMulti && !isBinaryMulti(contract)
      ? (contract as CPMMMultiContract).answers
          .filter((answer) => closed || !answer.resolution)
          .sort((a, b) => b.prob - a.prob)
      : []
  const answers = previewAnswers.slice(0, 3)
  const status =
    isBinary || (isMulti && isBinaryMulti(contract)) || !isMulti ? (
      <ContractStatusLabel
        contract={contract}
        className="shrink-0 text-sm font-semibold"
      />
    ) : null

  const question = (
    <Link
      href={contractPath(contract)}
      className="text-ink-800 hover:text-primary-700 block text-sm leading-snug"
    >
      {official && (
        <>
          <SportsMarketBadge market={contract} />{' '}
        </>
      )}
      {removeEmojis(
        official
          ? contract.question.replace(/\s*\[official\]\s*$/i, '')
          : contract.question
      )}
    </Link>
  )
  const metadata = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {!official && <SportsMarketBadge market={contract} />}
      <Link
        href={`/${contract.creatorUsername}`}
        className="text-ink-500 hover:text-primary-700 max-w-[12rem] truncate text-[11px]"
      >
        @{contract.creatorUsername}
      </Link>
      <span className="text-ink-400 text-[11px]">
        Ṁ{shortFormatNumber(contract.volume)} · {contract.uniqueBettorCount}{' '}
        {contract.uniqueBettorCount === 1 ? 'trader' : 'traders'}
      </span>
    </div>
  )
  const actions = (
    <Row className="shrink-0 items-center gap-2">
      {status}
      {!closed && isBinary && (
        <BetButton
          contract={contract as BinaryContract}
          user={user}
          questionTitle={contract.question}
          labels={isProp ? { yes: 'Yes', no: 'No' } : undefined}
          className={
            isProp
              ? 'grid grid-cols-2 gap-1.5 [&>button]:m-0 [&>button]:min-h-[32px] [&>button]:min-w-[3.5rem]'
              : 'flex'
          }
        />
      )}
      {!closed && isMulti && (
        <Button
          size="2xs"
          color="indigo-outline"
          onClick={() => {
            if (!user) {
              firebaseLogin()
              return
            }
            track('bet intent', { location: 'sports related market' })
            setBetOpen(true)
          }}
        >
          Bet
        </Button>
      )}
    </Row>
  )
  return (
    <div className={isProp ? 'py-2' : 'hover:bg-canvas-50 px-2.5 py-2'}>
      {isProp ? (
        <>
          {question}
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="min-w-0 flex-1">{metadata}</div>
            {actions}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <Row className="min-w-0 flex-1 items-start gap-2">
            {prefix}
            <div className="min-w-0 flex-1">
              {question}
              <div className="mt-1.5">{metadata}</div>
            </div>
          </Row>
          <div className="self-end sm:self-auto">{actions}</div>
        </div>
      )}
      {answers.length > 0 && (
        <Row
          className={clsx(
            'mt-1 flex-wrap gap-x-3 gap-y-0.5',
            prefix && 'pl-[4.25rem]'
          )}
        >
          {answers.map((a) => (
            <span key={a.id} className="text-ink-500 text-xs">
              <span className={clsx('text-ink-700')}>{a.text}</span>{' '}
              <span className="font-semibold tabular-nums">
                {Math.round(a.prob * 100)}%
              </span>
            </span>
          ))}
          {previewAnswers.length > answers.length && (
            <span className="text-ink-400 text-xs">
              +{previewAnswers.length - answers.length} more
            </span>
          )}
        </Row>
      )}
      {betOpen && isMulti && (
        <MultiBetDialog
          contract={contract as CPMMMultiContract}
          open={betOpen}
          setOpen={setBetOpen}
        />
      )}
    </div>
  )
}

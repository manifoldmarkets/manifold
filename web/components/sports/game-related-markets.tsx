import { ChevronDownIcon, PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useId, useMemo, useState } from 'react'
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
// Lines first, then props, then whatever else names the teams.
const GROUP_ORDER: RelatedGroup[] = ['game-lines', 'props', 'community']

/**
 * The markets on a game, under its card on the sport page. Today the list is
 * the schedule's matching: official lines and props by event id, and
 * community markets that name both teams near kickoff. Markets linked to a
 * game will go here too. Loads only when the disclosure is expanded.
 */
export function GameLinkedMarkets(props: { game: ScheduleGame }) {
  const { game } = props
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const [showAll, setShowAll] = useState(false)
  const ordered = useMemo(
    () =>
      GROUP_ORDER.flatMap((group) =>
        game.related.filter((r) => r.group === group)
      ),
    [game.related]
  )
  const ids = ordered.map((r) => r.id)
  // Cached per game; refetches if the id list changes (a new prop
  // appeared), keeping the previous list on screen.
  const { data, error } = useAPIGetter(
    'markets-by-ids',
    { ids },
    undefined,
    `sports-related-${game.id}`,
    ids.length > 0 && expanded
  )
  const contracts = useMemo(() => {
    if (!data) return undefined
    const byId = new Map(data.map((c) => [c.id, c]))
    return ids.map((id) => byId.get(id)).filter((c): c is Contract => !!c)
  }, [data, ids.join(',')])
  const visible = showAll ? contracts : contracts?.slice(0, INITIAL_ROWS)
  const hidden = (contracts?.length ?? 0) - (visible?.length ?? 0)

  return (
    <div className="border-ink-100 rounded-b-xl border-t">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`Props & more for ${game.home.name} vs ${game.away.name}`}
        onClick={() => setExpanded((value) => !value)}
        className="text-ink-600 hover:bg-canvas-50 focus-visible:ring-primary-500 flex min-h-[44px] w-full items-center gap-2 rounded-b-xl px-4 text-left text-xs font-semibold focus-visible:ring-2"
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
        <span className="text-ink-400 ml-auto font-normal">
          {expanded ? 'Collapse' : 'Explore'}
        </span>
      </button>
      <div
        id={panelId}
        hidden={!expanded}
        aria-busy={ids.length > 0 && visible === undefined && !error}
        className="bg-canvas-50 rounded-b-xl px-4 pb-2"
      >
        {ids.length === 0 ? (
          <p className="text-ink-500 py-3 text-sm">No linked markets yet.</p>
        ) : error ? (
          <p className="text-ink-500 mt-1 text-xs">
            Couldn't load these markets.
          </p>
        ) : visible === undefined ? (
          <Col role="status" className="divide-ink-200 divide-y">
            <span className="sr-only">Loading props</span>
            {ids.slice(0, INITIAL_ROWS).map((id) => (
              <div
                key={id}
                aria-hidden
                className="animate-pulse space-y-3 py-3"
              >
                <div className="space-y-1.5">
                  <div className="bg-ink-100 h-4 w-full rounded" />
                  <div className="bg-ink-100 h-4 w-2/3 rounded" />
                </div>
                <div className="bg-ink-100 h-3 w-1/2 rounded" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-ink-100 h-10 rounded-md" />
                  <div className="bg-ink-100 h-10 rounded-md" />
                </div>
              </div>
            ))}
          </Col>
        ) : (
          <Col className="divide-ink-200 divide-y">
            {visible.map((c) => (
              <RelatedMarketRow key={c.id} contract={c} layout="prop" />
            ))}
            {(hidden > 0 ||
              (showAll && (contracts?.length ?? 0) > INITIAL_ROWS)) && (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="text-primary-700 hover:bg-canvas-50 w-full px-2.5 py-1.5 text-left text-xs font-medium"
              >
                {showAll ? 'Show fewer' : `Show ${hidden} more`}
              </button>
            )}
          </Col>
        )}
        <Row className="border-ink-100 justify-end border-t pt-1">
          <Link
            href={createMarketHref(game)}
            onClick={() =>
              track('sports create related market', { contractId: game.id })
            }
            className="text-ink-500 hover:text-primary-700 flex min-h-[36px] items-center gap-1 text-xs font-medium"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add a market
          </Link>
        </Row>
      </div>
    </div>
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

/** A market row, with full-width actions when expanded inside a game. */
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

  return (
    <div className={isProp ? 'py-3' : 'hover:bg-canvas-50 px-2.5 py-2'}>
      <div
        className={clsx(
          'flex flex-col',
          isProp
            ? 'gap-3'
            : 'gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3'
        )}
      >
        <Row className="min-w-0 flex-1 items-start gap-2">
          {prefix}
          <div className="min-w-0 flex-1">
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
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {!official && <SportsMarketBadge market={contract} />}
              <Link
                href={`/${contract.creatorUsername}`}
                className="text-ink-500 hover:text-primary-700 max-w-[12rem] truncate text-[11px]"
              >
                @{contract.creatorUsername}
              </Link>
              <span className="text-ink-400 text-[11px]">
                Ṁ{shortFormatNumber(contract.volume)} ·{' '}
                {contract.uniqueBettorCount}{' '}
                {contract.uniqueBettorCount === 1 ? 'trader' : 'traders'}
              </span>
              {isProp && <span className="ml-auto">{status}</span>}
            </div>
          </div>
        </Row>
        <Row
          className={clsx(
            'items-center gap-2',
            isProp ? 'w-full' : 'shrink-0 self-end sm:self-auto'
          )}
        >
          {!isProp && status}
          {!closed && isBinary && (
            <BetButton
              contract={contract as BinaryContract}
              user={user}
              questionTitle={contract.question}
              labels={isProp ? { yes: 'Yes', no: 'No' } : undefined}
              className={
                isProp
                  ? 'grid w-full grid-cols-2 gap-2 [&>button]:m-0 [&>button]:min-h-[40px] [&>button]:w-full'
                  : 'flex'
              }
            />
          )}
          {!closed && isMulti && (
            <Button
              size="2xs"
              color="indigo-outline"
              className={isProp ? 'min-h-[40px] w-full' : undefined}
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
      </div>
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

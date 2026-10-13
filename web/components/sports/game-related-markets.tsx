import { PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Contract,
  contractPath,
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
import { BetButton } from 'web/components/bet/feed-bet-button'
import { MultiBetDialog } from 'web/components/bet/bet-dialog'
import { Button } from 'web/components/buttons/button'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useLiveContract } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

const INITIAL_ROWS = 3
// Lines first, then props, then whatever else names the teams.
const GROUP_ORDER: RelatedGroup[] = ['game-lines', 'props', 'community']

/**
 * The markets on a game, under its card on the sport page. Today the list is
 * the schedule's matching: official lines and props by event id, and
 * community markets that name both teams near kickoff. Markets linked to a
 * game will go here too. Loads once the card scrolls into view.
 */
export function GameLinkedMarkets(props: { game: ScheduleGame }) {
  const { game } = props
  const [seen, setSeen] = useState(false)
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
    ids.length > 0 && seen
  )
  const contracts = useMemo(() => {
    if (!data) return undefined
    const byId = new Map(data.map((c) => [c.id, c]))
    return ids.map((id) => byId.get(id)).filter((c): c is Contract => !!c)
  }, [data, ids.join(',')])
  const visible = showAll ? contracts : contracts?.slice(0, INITIAL_ROWS)
  const hidden = (contracts?.length ?? 0) - (visible?.length ?? 0)

  return (
    <div className="border-ink-100 bg-canvas-50 rounded-b-lg border-t px-3 py-2.5">
      {!seen && ids.length > 0 && (
        <VisibilityObserver onVisibilityUpdated={(v) => v && setSeen(true)} />
      )}
      <Row className="items-center justify-between gap-2">
        <span className="text-ink-600 text-xs font-medium">
          Markets on this game
          <span className="text-ink-400 font-normal">
            {' · '}
            {ids.length > 0 ? ids.length : 'none yet'}
          </span>
        </span>
        <Link
          href={createMarketHref(game)}
          onClick={() =>
            track('sports create related market', { contractId: game.id })
          }
          className="text-ink-500 hover:text-primary-700 flex items-center gap-1 text-xs font-medium"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add a market
        </Link>
      </Row>
      {ids.length === 0 ? null : error ? (
        <p className="text-ink-500 mt-1 text-xs">
          Couldn't load these markets.
        </p>
      ) : visible === undefined ? (
        <Col className="mt-2 gap-1.5">
          {ids.slice(0, INITIAL_ROWS).map((id) => (
            <div
              key={id}
              className="bg-ink-100 h-9 w-full animate-pulse rounded-md"
            />
          ))}
        </Col>
      ) : (
        <Col className="divide-ink-100 border-ink-200 bg-canvas-0 mt-2 divide-y rounded-md border">
          {visible.map((c) => (
            <RelatedMarketRow key={c.id} contract={c} />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-primary-700 hover:bg-canvas-50 w-full px-2.5 py-1.5 text-left text-xs font-medium"
            >
              Show {hidden} more
            </button>
          )}
        </Col>
      )}
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

/** A compact one-line market: question, current price, and a way to bet. */
export function RelatedMarketRow(props: {
  contract: Contract
  /** Rendered before the question: a time, a sport tag. */
  prefix?: React.ReactNode
}) {
  const { prefix } = props
  const contract = useLiveContract(props.contract)
  const user = useUser()
  const [betOpen, setBetOpen] = useState(false)
  const isBinary =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'cpmm-1'
  const isMulti = isMultiCpmm(contract)
  const closed =
    !!contract.resolution ||
    (!!contract.closeTime && contract.closeTime < Date.now())

  const answers =
    isMulti && !isBinaryMulti(contract)
      ? [...(contract as CPMMMultiContract).answers]
          .sort((a, b) => b.prob - a.prob)
          .slice(0, 3)
      : []

  return (
    <div className="hover:bg-canvas-50 px-2.5 py-2">
      {/* Phones: question on top, price and buttons underneath it. */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <Row className="min-w-0 flex-1 items-start gap-2">
          {prefix}
          <Link
            href={contractPath(contract)}
            className="text-ink-800 hover:text-primary-700 min-w-0 flex-1 text-sm leading-snug"
          >
            {removeEmojis(contract.question)}
          </Link>
        </Row>
        <Row className="shrink-0 items-center gap-2 self-end sm:self-auto">
          {(isBinary || (isMulti && isBinaryMulti(contract)) || !isMulti) && (
            <ContractStatusLabel
              contract={contract}
              className="text-sm font-semibold"
            />
          )}
          {!closed && isBinary && (
            <BetButton
              contract={contract as any}
              user={user}
              questionTitle={contract.question}
              className="flex"
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
          {(contract as CPMMMultiContract).answers.length > answers.length && (
            <span className="text-ink-400 text-xs">
              +{(contract as CPMMMultiContract).answers.length - answers.length}{' '}
              more
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

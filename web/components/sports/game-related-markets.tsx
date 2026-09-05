import { ExternalLinkIcon, PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Contract,
  contractPath,
  CPMMMultiContract,
  isBinaryMulti,
} from 'common/contract'
import { RelatedGroup, ScheduleGame } from 'common/sports-schedule'
import { shortFormatNumber } from 'common/util/format'
import { removeEmojis } from 'common/util/string'
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
import { gamePath } from './game-row'

/**
 * Everything attached to a game: the game market itself, official props from
 * the Manifold Sports pipeline, and community markets that mention the teams.
 * Loaded lazily the first time a row is expanded.
 */
export function GameRelatedMarkets(props: { game: ScheduleGame }) {
  const { game } = props
  const ids = game.related.map((r) => r.id)
  // Fetched on first expand and cached per game; refetches if the id list
  // changes (a new prop appeared), keeping the previous list on screen.
  const { data, error } = useAPIGetter(
    'markets-by-ids',
    { ids },
    undefined,
    `sports-related-${game.id}`,
    ids.length > 0
  )
  const contracts = useMemo(() => {
    if (ids.length === 0) return []
    if (!data) return undefined
    // Keep the server's order (best matches first).
    const byId = new Map(data.map((c) => [c.id, c]))
    return ids.map((id) => byId.get(id)).filter((c): c is Contract => !!c)
  }, [data, ids.join(',')])

  const groupById = new Map(game.related.map((r) => [r.id, r.group]))
  const inGroup = (group: RelatedGroup) =>
    (contracts ?? []).filter((c) => groupById.get(c.id) === group)
  const gameLines = inGroup('game-lines')
  const propMarkets = inGroup('props')
  const community = inGroup('community')
  const createHref = `/create?q=${encodeURIComponent(
    `${game.home.name} vs ${game.away.name}: `
  )}`

  return (
    <div className="border-ink-200 bg-canvas-50 rounded-b-lg border-t px-3 py-3">
      <Col className="gap-3">
        {/* The game market itself */}
        <Row className="items-center justify-between gap-2">
          <Col className="min-w-0 gap-0.5">
            <span className="text-ink-400 text-[10px] font-semibold uppercase tracking-wide">
              {game.source === 'community'
                ? 'Community game market'
                : 'Official game market'}
            </span>
            <Link
              href={gamePath(game)}
              className="text-ink-900 hover:text-primary-700 truncate text-sm font-medium"
            >
              {removeEmojis(game.question)}
            </Link>
            <span className="text-ink-500 text-xs">
              Ṁ{shortFormatNumber(game.volume)} volume ·{' '}
              {game.uniqueBettorCount} traders · by @{game.creatorUsername}
            </span>
          </Col>
          <Link
            href={gamePath(game)}
            className="text-primary-700 hover:bg-primary-50 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
          >
            Open market
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </Link>
        </Row>

        {ids.length > 0 && contracts === undefined && !error && (
          <Col className="gap-2">
            {[0, 1, 2].slice(0, Math.min(3, ids.length)).map((i) => (
              <div
                key={i}
                className="bg-ink-100 h-9 w-full animate-pulse rounded-md"
              />
            ))}
          </Col>
        )}
        {error && (
          <span className="text-ink-500 text-xs">
            Couldn't load related markets.
          </span>
        )}

        {gameLines.length > 0 && (
          <RelatedSection title="Game lines" contracts={gameLines} />
        )}
        {propMarkets.length > 0 && (
          <RelatedSection title="Props" contracts={propMarkets} />
        )}
        {community.length > 0 && (
          <RelatedSection
            title={
              gameLines.length + propMarkets.length > 0
                ? 'More on this game'
                : 'Related markets'
            }
            contracts={community}
          />
        )}

        {contracts !== undefined && contracts.length === 0 && (
          <span className="text-ink-500 text-xs">
            No props or side-bets on this game yet.
          </span>
        )}

        <Row>
          <Link
            href={createHref}
            onClick={() =>
              track('sports create related market', { contractId: game.id })
            }
            className="text-ink-600 hover:text-primary-700 border-ink-200 hover:border-primary-300 flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs font-medium"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Create a market on this game
          </Link>
        </Row>
      </Col>
    </div>
  )
}

function RelatedSection(props: { title: string; contracts: Contract[] }) {
  const { title, contracts } = props
  return (
    <Col className="gap-1">
      <span className="text-ink-400 text-[10px] font-semibold uppercase tracking-wide">
        {title}
      </span>
      <Col className="divide-ink-100 border-ink-200 bg-canvas-0 divide-y rounded-md border">
        {contracts.map((c) => (
          <RelatedMarketRow key={c.id} contract={c} />
        ))}
      </Col>
    </Col>
  )
}

/** A compact one-line market: question, current price, and a way to bet. */
export function RelatedMarketRow(props: { contract: Contract }) {
  const contract = useLiveContract(props.contract)
  const user = useUser()
  const [betOpen, setBetOpen] = useState(false)
  const isBinary =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'cpmm-1'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
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
      <Row className="items-start justify-between gap-3">
        <Link
          href={contractPath(contract)}
          className="text-ink-800 hover:text-primary-700 min-w-0 flex-1 text-sm leading-snug"
        >
          {removeEmojis(contract.question)}
        </Link>
        <Row className="shrink-0 items-center gap-2">
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
      </Row>
      {answers.length > 0 && (
        <Row className="mt-1 flex-wrap gap-x-3 gap-y-0.5">
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

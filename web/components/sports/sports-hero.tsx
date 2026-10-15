import {
  ChevronDownIcon,
  HeartIcon as OutlineHeartIcon,
} from '@heroicons/react/outline'
import { ChevronRightIcon, HeartIcon, UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { ReactNode, useId, useState } from 'react'
import { Answer } from 'common/answer'
import { contractPath, CPMMMultiContract } from 'common/contract'
import { AnySportKey, ScheduleGame, SPORT_BY_KEY } from 'common/sports-schedule'
import { shortFormatNumber } from 'common/util/format'
import { GameRow } from './game-row'
import { SportsMarketBadge } from './sports-market-badge'

/** Full multiple-choice contracts fit this view without inventing two teams. */
export type SportsHeroMarket = Pick<
  CPMMMultiContract,
  | 'id'
  | 'question'
  | 'slug'
  | 'creatorId'
  | 'creatorUsername'
  | 'volume'
  | 'uniqueBettorCount'
  | 'shouldAnswersSumToOne'
  | 'isResolved'
  | 'closeTime'
> & {
  answers: Pick<
    Answer,
    'id' | 'text' | 'prob' | 'index' | 'resolution' | 'resolutionProbability'
  >[]
}

type HeroActions = {
  liked?: boolean
  likeDisabled?: boolean
  onToggleLike?: () => void
  className?: string
}

type MarketHeroProps = HeroActions & {
  kind: 'market'
  market: SportsHeroMarket
  sport?: AnySportKey
  /** Already-loaded rows; linking and fetching remain with the caller. */
  linkedMarkets?: { id: string; content: ReactNode }[]
  /** Event metadata comes from the caller, never from parsing the question. */
  event?: {
    label: string
    startTime?: number
    chanceLabel?: string
    outcomesLabel?: string
    outcomeDescription?: string
  }
}

export type SportsHeroProps =
  | (HeroActions & { kind: 'game'; game: ScheduleGame; showLeague?: boolean })
  | MarketHeroProps

/** Scoreboards and a generic field of outcomes share one hero entry point. */
export function SportsHero(props: SportsHeroProps) {
  if (props.kind === 'game') return <GameRow {...props} variant="featured" />
  return <MarketHero key={props.market.id} {...props} />
}

const PREVIEW_COUNT = 4

function MarketHero({
  market,
  sport,
  event,
  linkedMarkets = [],
  liked,
  likeDisabled,
  onToggleLike,
  className,
}: MarketHeroProps) {
  const [expanded, setExpanded] = useState(false)
  const [propsExpanded, setPropsExpanded] = useState(false)
  const [activePanel, setActivePanel] = useState<'outcomes' | 'props'>(
    'outcomes'
  )
  const panelId = useId()
  const propsPanelId = useId()
  const outcomesId = useId()
  const propsId = useId()
  const titleId = useId()
  const LikeIcon = liked ? HeartIcon : OutlineHeartIcon
  const href = contractPath(market)
  const startTime =
    event?.startTime != null && Number.isFinite(event.startTime)
      ? event.startTime
      : undefined
  // Independent probabilities stay independent; never normalize the preview.
  const answers = [...market.answers].sort(
    (a, b) =>
      Number(!!a.resolution) - Number(!!b.resolution) ||
      (validProbability(b.prob) ?? -1) - (validProbability(a.prob) ?? -1) ||
      a.index - b.index
  )
  const preview = answers.slice(0, PREVIEW_COUNT)
  const rest = answers.slice(PREVIEW_COUNT)
  const hasProps = linkedMarkets.length > 0
  const featuredProps = linkedMarkets.slice(0, 2)
  const remainingProps = linkedMarkets.slice(2)
  const closed =
    market.isResolved ||
    (market.closeTime != null && market.closeTime <= Date.now())
  const controlClass =
    'text-ink-500 inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-medium tabular-nums'
  const actionClass =
    'hover:bg-primary-100 hover:text-primary-700 focus-visible:ring-primary-500 focus-visible:ring-2'

  return (
    <section
      id={`market-hero-${market.id}`}
      aria-labelledby={titleId}
      className={clsx(
        '@container/market-hero border-primary-200 bg-primary-50 scroll-mt-32 overflow-hidden rounded-2xl border',
        className
      )}
    >
      <div
        className={clsx(
          'grid',
          hasProps
            ? '@[40rem]/market-hero:grid-cols-2 @[54rem]/market-hero:grid-cols-[minmax(0,.95fr)_minmax(0,1fr)_minmax(0,1.2fr)]'
            : 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]'
        )}
      >
        <div
          className={clsx(
            'flex min-w-0 flex-col',
            hasProps &&
              '@[40rem]/market-hero:col-span-2 @[54rem]/market-hero:col-span-1'
          )}
        >
          <div className="flex items-center gap-2 px-4 py-2 sm:px-5">
            <div className="@container flex min-w-[1rem] flex-1 items-center gap-2">
              <SportsMarketBadge market={market} compact />
              <span className="text-primary-700 @[5rem]:not-sr-only sr-only whitespace-nowrap text-[10px] font-bold uppercase tracking-wide">
                Featured
              </span>
            </div>
            <div
              role="group"
              aria-label="Market activity and actions"
              className="flex shrink-0 items-center gap-1"
            >
              <span
                className={controlClass}
                title={`Ṁ${shortFormatNumber(market.volume)} traded`}
              >
                Ṁ{shortFormatNumber(market.volume)}
                <span className="sr-only"> traded</span>
              </span>
              <span
                className={controlClass}
                title={`${market.uniqueBettorCount} traders`}
              >
                <UsersIcon className="h-4 w-4" aria-hidden />
                {shortFormatNumber(market.uniqueBettorCount)}
                <span className="sr-only"> traders</span>
              </span>
              {onToggleLike && (
                <button
                  type="button"
                  onClick={onToggleLike}
                  disabled={likeDisabled}
                  aria-pressed={!!liked}
                  aria-label={`${liked ? 'Unlike' : 'Like'} ${market.question}`}
                  className={clsx(
                    controlClass,
                    actionClass,
                    'w-8 !px-0 disabled:opacity-50',
                    liked && '!text-primary-600'
                  )}
                >
                  <LikeIcon className="h-4 w-4" aria-hidden />
                </button>
              )}
              <Link
                href={href}
                aria-label={`Open ${market.question} market page`}
                className={clsx(controlClass, actionClass, 'w-8 !px-0')}
              >
                <ChevronRightIcon className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
          <div
            className={clsx(
              'flex flex-1 flex-col justify-center px-4 pb-5 pt-2 sm:px-5',
              hasProps && '@[40rem]/market-hero:pb-4'
            )}
          >
            <div className="text-ink-500 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>
                {event?.label ??
                  (sport ? SPORT_BY_KEY[sport]?.label : undefined) ??
                  'Sports'}
              </span>
              {startTime != null && (
                <time dateTime={new Date(startTime).toISOString()}>
                  · {dayjs(startTime).format('ddd, MMM D · h:mma')}
                </time>
              )}
              {closed && (
                <span className="text-ink-700 font-semibold">
                  · {market.isResolved ? 'Resolved' : 'Closed'}
                </span>
              )}
            </div>
            <h2
              id={titleId}
              className={clsx(
                'text-ink-1000 mt-3 max-w-lg text-xl font-bold leading-tight [overflow-wrap:anywhere]',
                !hasProps && 'sm:text-2xl'
              )}
            >
              {market.question}
            </h2>
            <p className="text-ink-500 mt-2 text-xs leading-relaxed">
              {event?.outcomeDescription ??
                (market.shouldAnswersSumToOne
                  ? 'One outcome wins.'
                  : 'Each outcome has an independent chance.')}
            </p>
            {sport === 'f1' && <RacingIllustration compact={hasProps} />}
          </div>
        </div>
        {hasProps && (
          <div
            role="group"
            aria-label="Hero preview"
            className="border-primary-200 @[40rem]/market-hero:hidden flex gap-1 border-t px-4 py-2"
          >
            {(
              [
                {
                  value: 'outcomes',
                  label: event?.outcomesLabel ?? 'Outcomes',
                  count: answers.length,
                  id: outcomesId,
                },
                {
                  value: 'props',
                  label: 'Props',
                  count: linkedMarkets.length,
                  id: propsId,
                },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={activePanel === item.value}
                aria-controls={item.id}
                onClick={() => setActivePanel(item.value)}
                className={clsx(
                  'focus-visible:ring-primary-500 flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold focus-visible:ring-2',
                  activePanel === item.value
                    ? 'bg-canvas-0 text-primary-700 shadow-sm'
                    : 'text-ink-500 hover:bg-primary-100'
                )}
              >
                {item.label}
                <span className="text-ink-400 font-normal">{item.count}</span>
              </button>
            ))}
          </div>
        )}
        <div
          id={outcomesId}
          className={clsx(
            'border-primary-200 bg-canvas-0/40 min-w-0 flex-col px-4 pb-2 pt-3',
            hasProps
              ? [
                  '@[40rem]/market-hero:border-t @[54rem]/market-hero:border-l @[54rem]/market-hero:border-t-0 min-h-[260px]',
                  activePanel === 'outcomes'
                    ? 'flex'
                    : '@[40rem]/market-hero:flex hidden',
                ]
              : 'flex border-t lg:border-l lg:border-t-0'
          )}
        >
          <div className="text-ink-500 mb-1 flex items-center justify-between gap-3 text-xs">
            <h3 className="font-semibold">
              {market.shouldAnswersSumToOne
                ? 'Leading contenders'
                : 'Independent outcomes'}
            </h3>
            <span>{event?.chanceLabel ?? 'Chance'}</span>
          </div>
          <div className="divide-ink-200 divide-y">
            {preview.map((answer) => (
              <OutcomeRow key={answer.id} answer={answer} href={href} />
            ))}
          </div>
          {answers.length === 0 && (
            <p className="text-ink-500 py-6 text-sm">No outcomes yet.</p>
          )}
          {rest.length > 0 && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded((value) => !value)}
              className="text-primary-700 hover:bg-primary-100 focus-visible:ring-primary-500 mt-auto flex min-h-[32px] items-center gap-1.5 self-end rounded-lg px-2 text-xs font-semibold focus-visible:ring-2"
            >
              {expanded ? 'Show fewer' : `Show all ${answers.length}`}
              <ChevronDownIcon
                className={clsx(
                  'h-4 w-4 transition-transform',
                  expanded && 'rotate-180'
                )}
              />
            </button>
          )}
        </div>
        {hasProps && (
          <div
            id={propsId}
            className={clsx(
              'border-primary-200 bg-canvas-0/40 @[40rem]/market-hero:border-l @[40rem]/market-hero:border-t @[54rem]/market-hero:border-t-0 min-h-[260px] min-w-0 flex-col px-4 pb-2 pt-3',
              activePanel === 'props'
                ? 'flex'
                : '@[40rem]/market-hero:flex hidden'
            )}
          >
            <h3 className="text-ink-500 mb-1 text-xs font-semibold">
              Props & more
            </h3>
            <div className="divide-ink-200 divide-y">
              {featuredProps.map((prop) => (
                <div key={prop.id}>{prop.content}</div>
              ))}
            </div>
            {remainingProps.length > 0 && (
              <button
                type="button"
                aria-expanded={propsExpanded}
                aria-controls={propsPanelId}
                onClick={() => setPropsExpanded((value) => !value)}
                className="text-primary-700 hover:bg-primary-100 focus-visible:ring-primary-500 mt-auto flex min-h-[32px] items-center gap-1.5 self-end rounded-lg px-2 text-xs font-semibold focus-visible:ring-2"
              >
                {propsExpanded
                  ? 'Fewer markets'
                  : `${remainingProps.length} more ${
                      remainingProps.length === 1 ? 'market' : 'markets'
                    }`}
                <ChevronDownIcon
                  className={clsx(
                    'h-4 w-4 transition-transform',
                    propsExpanded && 'rotate-180'
                  )}
                />
              </button>
            )}
          </div>
        )}
      </div>
      <div id={panelId} hidden={!expanded}>
        {expanded && (
          <div
            className={clsx(
              'border-primary-200 bg-canvas-50 border-t px-4 pb-2',
              hasProps &&
                activePanel !== 'outcomes' &&
                '@[40rem]/market-hero:block hidden'
            )}
          >
            {hasProps && (
              <h3 className="text-ink-500 pt-3 text-xs font-semibold">
                More {event?.outcomesLabel?.toLowerCase() ?? 'outcomes'}
              </h3>
            )}
            <div className="grid gap-x-6 lg:grid-cols-2">
              {rest.map((answer) => (
                <div
                  key={answer.id}
                  className="border-ink-200 min-w-0 border-b"
                >
                  <OutcomeRow answer={answer} href={href} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div id={propsPanelId} hidden={!propsExpanded}>
        {propsExpanded && (
          <div
            className={clsx(
              'border-primary-200 bg-canvas-50 border-t px-4 pb-2',
              activePanel !== 'props' && '@[40rem]/market-hero:block hidden'
            )}
          >
            <h3 className="text-ink-500 pt-3 text-xs font-semibold">
              More props & markets
            </h3>
            <div className="@[40rem]/market-hero:grid-cols-2 grid gap-x-6">
              {remainingProps.map((prop) => (
                <div
                  key={prop.id}
                  className="border-ink-200 min-w-0 border-b last:border-b-0"
                >
                  {prop.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function validProbability(prob: number) {
  return Number.isFinite(prob) && prob >= 0 && prob <= 1 ? prob : null
}

function OutcomeRow({
  answer,
  href,
}: {
  answer: SportsHeroMarket['answers'][number]
  href: string
}) {
  const prob = validProbability(answer.resolutionProbability ?? answer.prob)
  const label =
    answer.resolution === 'YES'
      ? 'Yes'
      : answer.resolution === 'NO'
      ? 'No'
      : answer.resolution === 'CANCEL'
      ? 'N/A'
      : prob === null
      ? '—'
      : `${Math.round(prob * 100)}%`
  return (
    <Link
      href={href}
      aria-label={`${answer.text}: ${label}. Open market`}
      className="hover:bg-primary-100/60 focus-visible:ring-primary-500 -mx-1 flex min-h-[48px] items-center justify-between gap-3 rounded-lg px-1 py-1.5 focus-visible:ring-2"
    >
      <span className="text-ink-900 min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
        {answer.text}
      </span>
      <span className="border-primary-200 bg-canvas-0 text-primary-700 inline-flex min-h-[32px] w-16 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums">
        {label}
      </span>
    </Link>
  )
}

/** Decorative race motif: no predicted finishing positions or real circuit. */
function RacingIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 300 100"
      aria-hidden="true"
      focusable="false"
      className={clsx(
        'mt-3 hidden w-full max-w-xs self-center',
        compact ? '@[54rem]/market-hero:block h-12' : 'h-20 sm:block'
      )}
    >
      <path
        d="M57 22H243C267 22 280 34 280 50S267 78 243 78H57C33 78 20 66 20 50S33 22 57 22Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="14"
        className="text-primary-100"
      />
      <path
        d="M57 22H243C267 22 280 34 280 50S267 78 243 78H57C33 78 20 66 20 50S33 22 57 22Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="5 5"
        className="text-primary-300"
      />
      <g
        transform="translate(90 22)"
        className="text-primary-600"
        fill="currentColor"
      >
        <rect x="-15" y="-4" width="30" height="8" rx="4" />
        <path d="M-8-8H5L13 0 5 8H-8Z" />
        <path d="M-13-10H-8V10H-13ZM11-9H15V9H11Z" />
        <rect
          x="-3"
          y="-3"
          width="7"
          height="6"
          rx="2"
          className="text-canvas-0"
        />
      </g>
      <g
        transform="translate(211 78) rotate(180)"
        className="text-primary-400"
        fill="currentColor"
      >
        <rect x="-15" y="-4" width="30" height="8" rx="4" />
        <path d="M-8-8H5L13 0 5 8H-8Z" />
        <path d="M-13-10H-8V10H-13ZM11-9H15V9H11Z" />
        <rect
          x="-3"
          y="-3"
          width="7"
          height="6"
          rx="2"
          className="text-canvas-0"
        />
      </g>
      <g
        transform="translate(193 15)"
        className="text-primary-700"
        fill="currentColor"
      >
        <path d="M0 0H5V5H0ZM5 5H10V10H5ZM0 10H5V15H0ZM10 0H15V5H10ZM10 10H15V15H10Z" />
      </g>
    </svg>
  )
}

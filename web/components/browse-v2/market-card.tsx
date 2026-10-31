import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import { UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { getDisplayProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
  dayProbChange,
  isMultiCpmm,
  MultiContract,
} from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { Group } from 'common/group'
import {
  formatMoneyShort,
  formatPercentShort,
  shortFormatNumber,
} from 'common/util/format'
import { capitalize, orderBy } from 'lodash'
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { BsRocketTakeoff } from 'react-icons/bs'
import { FaArrowDown, FaArrowUp } from 'react-icons/fa'

import { BetDialog, MultiBetDialog } from 'web/components/bet/bet-dialog'
import { getAnswerColor } from 'web/components/charts/contract/choice'
import {
  ContractRow,
  ContractStatusLabel,
  isClosed,
} from 'web/components/contract/contracts-table'
import {
  actionColumn,
  liquidityColumn,
  probColumn,
  traderColumn,
} from 'web/components/contract/contract-table-col-formats'
import { Avatar } from 'web/components/widgets/avatar'
import { useLiveContract } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { listGroupsBySlug } from 'web/lib/supabase/groups'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { useBrowseTopics } from './browse-topics'
import { ProbSparkline } from './prob-sparkline'

const MAX_ANSWERS = 3

const trackClick = (contract: Contract, section: string) =>
  track('click browse contract', {
    slug: contract.slug,
    contractId: contract.id,
    section,
  })

export function MarketCard(props: { contract: Contract; section: string }) {
  const contract = useLiveContract(props.contract)
  const { section } = props
  const isBinary = contract.outcomeType === 'BINARY'
  const isMulti = isMultiCpmm(contract)

  return (
    <Link
      href={contractPath(contract)}
      onClick={() => trackClick(contract, section)}
      className={clsx(
        'bg-canvas-0 border-ink-200 group flex min-w-0 flex-col gap-3 rounded-xl border p-4 transition-colors',
        'hover:border-primary-300 focus-visible:ring-primary-500 outline-none focus-visible:ring-2',
        'dark:border-ink-300'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-ink-1000 group-hover:text-primary-700 line-clamp-3 min-w-0 font-semibold leading-snug">
          {contract.question}
        </h3>
        {isBinary ? (
          <BinaryOdds contract={contract as BinaryContract} />
        ) : !isMulti ? (
          <ContractStatusLabel
            contract={contract}
            className="shrink-0 text-lg font-semibold"
          />
        ) : null}
      </div>

      {isMulti && <TopAnswers contract={contract as MultiContract} />}

      {/* The chart grows to fill a card stretched by a taller neighbour. */}
      {isBinary && !contract.resolution && (
        <ProbSparkline
          contract={contract as BinaryContract}
          className="min-h-[2.75rem] flex-1"
        />
      )}
      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <MarketMeta contract={contract} />
          <div className="flex shrink-0 items-center gap-1">
            {isBinary ? (
              <YesNoButtons contract={contract as BinaryContract} />
            ) : (
              <TradeButton contract={contract} />
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

// Reuse the classic browse row so avatars, stats, actions and desktop
// answer-distribution bars stay aligned with the rest of the site.
export function MarketListRow(props: { contract: Contract; section: string }) {
  const { contract, section } = props
  const user = useUser()
  const hasMobileAnswer =
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    isMultiCpmm(contract) &&
    !!leadingAnswer(contract)

  return (
    <ContractRow
      contract={contract}
      trackingPostfix={section}
      compactMobile
      faded={
        (isClosed(contract) && contract.creatorId !== user?.id) ||
        contract.isResolved
      }
      columns={[
        {
          header: 'Topics',
          width: 'w-6 shrink-0',
          content: ({ contract }) => <TopicsMenu contract={contract} small />,
        },
        {
          ...traderColumn,
          width: hasMobileAnswer
            ? 'hidden sm:flex sm:w-[70px]'
            : 'w-12 shrink-0 sm:w-[70px]',
        },
        {
          ...liquidityColumn,
          width: hasMobileAnswer
            ? 'hidden sm:flex sm:w-[40px]'
            : 'w-[72px] shrink-0 sm:w-[40px]',
        },
        {
          ...probColumn,
          width: hasMobileAnswer
            ? 'min-w-0 flex-1 pr-2 sm:flex-none sm:w-[80px] sm:pr-0'
            : 'w-[60px] shrink-0 sm:w-[80px]',
          content: ({ contract }) => <ListProbability contract={contract} />,
        },
        {
          ...actionColumn,
          width: 'w-10 shrink-0 sm:w-12',
        },
      ]}
    />
  )
}

function ListProbability(props: { contract: Contract }) {
  const { contract } = props
  const leader =
    contract.outcomeType === 'MULTIPLE_CHOICE' && isMultiCpmm(contract)
      ? leadingAnswer(contract)
      : undefined
  if (!leader) return probColumn.content({ contract })

  const label = contract.isResolved
    ? 'Resolved'
    : isClosed(contract)
    ? 'Closed'
    : leaderLabel(contract as MultiContract, leader)

  return (
    <>
      <span className="hidden sm:block">
        {probColumn.content({ contract })}
      </span>
      <span
        className="flex w-full min-w-0 items-center gap-1 text-xs sm:hidden"
        title={label + ': ' + leader.text}
      >
        <span className="text-ink-500 shrink-0">{label}:</span>
        <span className="text-ink-800 min-w-0 truncate">{leader.text}</span>
        <span className="text-ink-900 ml-auto shrink-0 pl-1 font-medium tabular-nums">
          {formatPercentShort(answerProb(leader))}
        </span>
      </span>
    </>
  )
}

function BinaryOdds(props: { contract: BinaryContract; compact?: boolean }) {
  const { contract, compact } = props
  if (contract.resolution) {
    return (
      <ContractStatusLabel
        contract={contract}
        className={clsx(
          'shrink-0 font-semibold',
          compact ? 'text-base' : 'text-lg'
        )}
      />
    )
  }
  const prob = getDisplayProbability(contract)
  const change = dayProbChange(contract)
  const up = contract.probChanges.day > 0
  return (
    <div
      className={clsx(
        'flex shrink-0',
        // Keep the compact price and daily change side by side on phones.
        compact
          ? 'flex-row-reverse items-center gap-1.5 sm:flex-col sm:items-end sm:gap-0.5'
          : 'flex-col items-end gap-1'
      )}
    >
      <span
        className={clsx(
          'text-ink-1000 font-semibold tabular-nums leading-none',
          compact ? 'text-base' : 'text-2xl'
        )}
      >
        {formatPercentShort(prob)}
      </span>
      {change > 0 ? (
        <ChangeBadge up={up} points={change} />
      ) : (
        !compact && <span className="text-ink-500 text-xs">chance</span>
      )}
    </div>
  )
}

export function ChangeBadge(props: {
  up: boolean
  points: number
  className?: string
}) {
  const { up, points, className } = props
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums',
        up
          ? 'bg-teal-600/10 text-teal-600'
          : 'text-scarlet-500 bg-scarlet-500/10',
        className
      )}
      title="Change in the last 24 hours"
    >
      {up ? (
        <FaArrowUp className="h-2.5 w-2.5" />
      ) : (
        <FaArrowDown className="h-2.5 w-2.5" />
      )}
      {points}
    </span>
  )
}

const answerProb = (answer: Answer) =>
  Number.isFinite(answer.prob) ? answer.prob : 0

// Open market: live answers first, settled ones after. Resolved market:
// winners first.
function sortedAnswers(contract: MultiContract) {
  return orderBy(
    contract.answers.filter((a) => !a.isOther || a.prob > 0.005),
    [
      (a) =>
        contract.isResolved
          ? a.resolution === 'YES'
            ? 0
            : 1
          : a.resolution
          ? 1
          : 0,
      (a) => -answerProb(a),
    ]
  )
}

// The answer a list row names: the likeliest live answer, skipping the
// catch-all Other, falling back to whatever sorts first.
function leadingAnswer(contract: MultiContract) {
  const sorted = sortedAnswers(contract)
  return sorted.find((a) => !a.isOther && !a.resolution) ?? sorted[0]
}

// Answers of a set market don't compete, so none of them is "leading". When
// the catch-all Other is ahead, the named answer shown isn't leading either.
const leaderLabel = (contract: MultiContract, leader: Answer) =>
  'shouldAnswersSumToOne' in contract && !contract.shouldAnswersSumToOne
    ? 'Most likely'
    : sortedAnswers(contract)[0]?.id !== leader.id
    ? 'Top named answer'
    : 'Leading'

function TopAnswers(props: { contract: MultiContract }) {
  const { contract } = props
  const answers = sortedAnswers(contract)
  const shown = answers.slice(0, MAX_ANSWERS)
  const more = answers.length - shown.length
  if (shown.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((answer) => {
        const prob = answerProb(answer)
        return (
          <div
            key={answer.id}
            className="bg-ink-100 dark:bg-ink-200 relative overflow-hidden rounded-md"
          >
            <div
              className="absolute inset-y-0 left-0 opacity-60 dark:opacity-40"
              style={{
                width: `${Math.max(0, Math.min(1, prob)) * 100}%`,
                backgroundColor: getAnswerColor(answer),
              }}
            />
            <div className="relative flex items-center justify-between gap-3 px-2.5 py-1 text-sm">
              <span className="text-ink-900 truncate">{answer.text}</span>
              <span className="text-ink-1000 shrink-0 font-semibold tabular-nums">
                {answer.resolution === 'YES' ? 'Won' : formatPercentShort(prob)}
              </span>
            </div>
          </div>
        )
      })}
      {more > 0 && (
        <span className="text-ink-500 text-xs">
          +{more} more {more === 1 ? 'answer' : 'answers'}
        </span>
      )}
    </div>
  )
}

function MarketMeta(props: {
  contract: Contract
  className?: string
  // Phone list rows: traders and time left only, rocket without the word.
  compact?: boolean
}) {
  const { contract, className, compact } = props
  const now = Date.now()
  const closeLabel = contract.isResolved
    ? 'Resolved'
    : contract.closeTime && contract.closeTime < now
    ? 'Closed'
    : contract.closeTime
    ? `${shortenedFromNow(contract.closeTime)} left`
    : undefined
  return (
    <div
      className={clsx(
        'text-ink-500 flex min-w-0 items-center gap-2 text-xs',
        className
      )}
    >
      <TopicsMenu contract={contract} small />
      {!compact && (
        <Avatar
          username={contract.creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          size="2xs"
          noLink
        />
      )}
      <span className="flex items-center gap-0.5 tabular-nums">
        <UserIcon className="h-3 w-3" />
        {shortFormatNumber(contract.uniqueBettorCount ?? 0)}
      </span>
      {!compact && contract.volume > 0 && (
        <span className="tabular-nums">
          {formatMoneyShort(contract.volume)}
        </span>
      )}
      {closeLabel && <span className="truncate">{closeLabel}</span>}
    </div>
  )
}

// Boosted markets rank higher because someone paid to promote them, so say
// so wherever one appears.
export function BoostedTag(props: { iconOnly?: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1 font-medium text-amber-600 dark:text-amber-400"
      title="Boosted: promoted with a paid boost"
    >
      <BsRocketTakeoff className="h-3.5 w-3.5" aria-hidden />
      {props.iconOnly ? <span className="sr-only">Boosted</span> : 'Boosted'}
    </span>
  )
}

// Cards are links; dialogs and menus rendered inside them must not let a
// click bubble up to the link and navigate away.
function StopClicks(props: {
  children: ReactNode
  className?: string
  // Also cancel the link's navigation. Only for wrappers whose DOM sits
  // inside the link; portaled panels must keep their own links working.
  preventDefault?: boolean
}) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <span
      className={props.className}
      onClick={(e) => {
        if (props.preventDefault) e.preventDefault()
        e.stopPropagation()
      }}
    >
      {props.children}
    </span>
  )
}

function YesNoButtons(props: { contract: BinaryContract; compact?: boolean }) {
  const { contract, compact } = props
  const user = useUser()
  const [outcome, setOutcome] = useState<'YES' | 'NO'>()
  if (isClosed(contract) || contract.isResolved) return null

  const open = (next: 'YES' | 'NO') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    track('bet intent', {
      location: 'browse card',
      outcome: next,
      token: contract.token,
    })
    if (!user) {
      firebaseLogin()
      return
    }
    setOutcome(next)
  }
  const size = compact ? 'px-2.5 py-1 sm:py-0.5' : 'px-3 py-1'

  return (
    <StopClicks className="flex shrink-0 gap-1.5">
      <button
        type="button"
        onClick={open('YES')}
        aria-label={`${capitalize(TRADE_TERM)} YES on ${contract.question}`}
        className={clsx(
          'rounded-md bg-teal-600/10 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-600 hover:text-white dark:text-teal-400',
          size
        )}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={open('NO')}
        aria-label={`${capitalize(TRADE_TERM)} NO on ${contract.question}`}
        className={clsx(
          'bg-scarlet-500/10 text-scarlet-600 hover:bg-scarlet-500 dark:text-scarlet-400 rounded-md text-sm font-semibold transition-colors hover:text-white',
          size
        )}
      >
        No
      </button>
      {outcome && (
        <BetDialog
          contract={contract}
          open={!!outcome}
          setOpen={(o) => !o && setOutcome(undefined)}
          trackingLocation="browse card"
          initialOutcome={outcome}
        />
      )}
    </StopClicks>
  )
}

// Trade button for everything that isn't a plain yes/no market, styled to
// match the Yes and No buttons.
export function TradeButton(props: { contract: Contract; compact?: boolean }) {
  const { contract, compact } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  const isMulti = isMultiCpmm(contract)
  if (
    isClosed(contract) ||
    contract.isResolved ||
    !(contract.mechanism === 'cpmm-1' || isMulti)
  )
    return null
  return (
    <StopClicks className="flex shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${capitalize(TRADE_TERM)} on ${contract.question}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          track('bet intent', {
            location: 'browse card',
            token: contract.token,
          })
          if (!user) {
            firebaseLogin()
            return
          }
          setOpen(true)
        }}
        className={clsx(
          'bg-primary-600/10 text-primary-700 hover:bg-primary-600 dark:text-primary-300 rounded-md text-sm font-semibold transition-colors hover:text-white',
          compact ? 'px-2.5 py-1 sm:py-0.5' : 'px-3 py-1'
        )}
      >
        {capitalize(TRADE_TERM)}
      </button>
      {open &&
        (isMulti ? (
          <MultiBetDialog
            contract={contract as CPMMMultiContract}
            open={open}
            setOpen={setOpen}
          />
        ) : (
          <BetDialog
            contract={contract as BinaryContract}
            open={open}
            setOpen={setOpen}
            trackingLocation="browse card"
          />
        ))}
    </StopClicks>
  )
}

// Always show the topics control. Boosted markets use a rocket in the same
// slot, retaining both the promotion disclosure and access to topics.
function TopicsMenu(props: { contract: Contract; small?: boolean }) {
  const { contract, small } = props
  const slugs = (contract.groupSlugs ?? []).slice(0, 6)
  if (slugs.length === 0)
    return contract.boosted ? (
      <BoostedTag iconOnly />
    ) : small ? null : (
      <span className="w-7 shrink-0" />
    )
  return (
    <StopClicks className="shrink-0" preventDefault>
      <Popover className="relative">
        <PopoverButton
          aria-label={
            contract.boosted
              ? 'Topics for this boosted market'
              : 'Topics for this market'
          }
          title={
            contract.boosted
              ? "Boosted: promoted with a paid boost. Follow or hide this market's topics"
              : "Follow or hide this market's topics"
          }
          className={clsx(
            'text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center rounded-md outline-none',
            small ? 'h-5 w-6' : 'h-7 w-7'
          )}
        >
          {contract.boosted ? (
            <BoostedTag iconOnly />
          ) : (
            <DotsHorizontalIcon className="h-5 w-5" />
          )}
        </PopoverButton>
        <PopoverPanel
          anchor={{ to: 'bottom end', gap: 6 }}
          className="bg-canvas-0 border-ink-200 z-50 w-72 rounded-lg border p-2 shadow-lg"
        >
          <StopClicks>
            <TopicsMenuBody slugs={slugs} />
          </StopClicks>
        </PopoverPanel>
      </Popover>
    </StopClicks>
  )
}

function TopicsMenuBody(props: { slugs: string[] }) {
  const { slugs } = props
  const topics = useBrowseTopics()
  const [groups, setGroups] = useState<Group[]>()
  useEffect(() => {
    listGroupsBySlug(slugs).then(setGroups)
  }, [slugs.join(',')])

  if (!topics.signedIn) {
    return (
      <button
        type="button"
        onClick={() => firebaseLogin()}
        className="text-primary-700 w-full px-2 py-1.5 text-left text-sm font-medium"
      >
        Sign in to follow or hide topics
      </button>
    )
  }
  return (
    <div className="flex flex-col">
      <span className="text-ink-500 px-2 pb-1 text-xs font-medium uppercase tracking-wide">
        Topics on this market
      </span>
      {groups === undefined ? (
        <div className="bg-ink-100 m-2 h-16 animate-pulse rounded" />
      ) : (
        groups.map((g) => (
          <TopicRow key={g.id} topic={g} className="px-2 py-1.5" />
        ))
      )}
    </div>
  )
}

// One topic with Follow and Hide toggles. Shared with the Your topics panel.
export function TopicRow(props: {
  topic: Pick<Group, 'id' | 'slug' | 'name'>
  className?: string
  hideFollow?: boolean
}) {
  const { topic, className, hideFollow } = props
  const topics = useBrowseTopics()
  const following = topics.isFollowing(topic.slug)
  const hidden = topics.isHidden(topic.slug)
  const busy = topics.isPending(topic.slug)
  return (
    <div className={clsx('flex items-center justify-between gap-2', className)}>
      <Link
        href={`/topic/${topic.slug}`}
        className="text-ink-900 hover:text-primary-700 min-w-0 truncate text-sm"
      >
        {topic.name}
      </Link>
      <div className="flex shrink-0 gap-1">
        {!hideFollow && !hidden && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              following ? topics.unfollow(topic) : topics.follow(topic)
            }
            className={clsx(
              'rounded-md px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50',
              following
                ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                : 'text-primary-700 hover:bg-primary-50 ring-primary-300 ring-1'
            )}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        )}
        {!following && (
          <button
            type="button"
            disabled={busy}
            onClick={() => (hidden ? topics.unhide(topic) : topics.hide(topic))}
            className={clsx(
              'rounded-md px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50',
              hidden
                ? 'bg-ink-200 text-ink-800 hover:bg-ink-300'
                : 'text-ink-600 hover:bg-ink-100 ring-ink-300 ring-1'
            )}
          >
            {hidden ? 'Hidden' : 'Hide'}
          </button>
        )}
      </div>
    </div>
  )
}

export function MarketCardSkeleton() {
  return (
    <div className="border-ink-200 dark:border-ink-300 flex animate-pulse flex-col gap-3 rounded-xl border p-4">
      <div className="flex justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <div className="bg-ink-200 h-4 w-11/12 rounded" />
          <div className="bg-ink-200 h-4 w-2/3 rounded" />
        </div>
        <div className="bg-ink-200 h-7 w-12 rounded" />
      </div>
      <div className="bg-ink-100 h-10 w-full rounded" />
      <div className="flex justify-between">
        <div className="bg-ink-100 h-3 w-24 rounded" />
        <div className="bg-ink-100 h-6 w-20 rounded" />
      </div>
    </div>
  )
}

export function MarketRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 px-3 py-2 sm:px-4">
      <div className="flex flex-1 flex-col gap-2">
        <div className="bg-ink-200 h-4 w-3/4 rounded" />
        <div className="bg-ink-100 h-3 w-32 rounded" />
      </div>
      <div className="bg-ink-200 h-6 w-12 rounded" />
    </div>
  )
}

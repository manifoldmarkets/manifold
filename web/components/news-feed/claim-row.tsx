import { CheckCircleIcon, PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { NewsArticle, NewsClaim } from 'common/news-feed'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useLiveContract } from 'web/hooks/use-contract'
import type { SimulatedMarket } from './create-from-claim'
import {
  EarlyBadge,
  MarketMeta,
  Price,
  QuestionLink,
  TradeButtons,
} from './news-market-row'

/**
 * A claim from the article, quoted word for word with who made it, paired
 * with the market that tests it. Three states on the right: the existing
 * market that resolves on exactly this claim; the reader's newly published
 * one; or, when neither exists, an offer to create one from a draft.
 */
export function ClaimRow(props: {
  claim: NewsClaim
  storyId: string
  article: NewsArticle
  match?: Contract
  /** Markets on this many stories, by contract id. */
  storyCounts: Record<string, number>
  /** A market the reader published from this claim as its direct test. */
  published?: SimulatedMarket
  /** The reader published a broader market from this claim instead. */
  publishedRelated?: boolean
  onCreate: () => void
}) {
  const {
    claim,
    storyId,
    article,
    match,
    storyCounts,
    published,
    publishedRelated,
    onCreate,
  } = props

  return (
    <div
      className="bg-canvas-0 border-ink-200 grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_15.5rem]"
      data-claim-id={claim.id}
    >
      <Col className="min-w-0 gap-1.5">
        <blockquote className="border-ink-300 text-ink-900 border-l-2 pl-3 text-[15px] leading-relaxed">
          {quoted(claim.excerpt)}
        </blockquote>
        <Attribution claim={claim} article={article} />
      </Col>

      {match ? (
        <DirectMatch
          contract={match}
          storyId={storyId}
          byReader={claim.matchBy === 'reader'}
          storyCount={storyCounts[match.id]}
        />
      ) : published ? (
        <Published market={published} />
      ) : (
        <Col className="border-ink-300 justify-between gap-2 rounded-md border border-dashed px-3 py-2.5">
          <Col className="gap-1">
            <span className="text-ink-500 text-[10px] font-bold uppercase tracking-wider">
              No market tests this yet
            </span>
            {claim.draft && (
              <span className="text-ink-700 text-sm leading-snug">
                <span className="text-ink-500">Suggested: </span>
                {claim.draft.question}
              </span>
            )}
          </Col>
          {publishedRelated && (
            <span className="text-ink-500 text-xs leading-snug">
              Your broader market is under Related outlook.
            </span>
          )}
          <Button
            size="xs"
            color="indigo-outline"
            onClick={onCreate}
            className="self-start"
          >
            <PlusIcon className="mr-1 h-3.5 w-3.5" />
            Create market
          </Button>
        </Col>
      )}
    </div>
  )
}

/** Quote marks unless the excerpt is already a whole quotation. */
const quoted = (s: string) => (/^["“].*["”]$/.test(s.trim()) ? s : `“${s}”`)

/**
 * Who said it, in the article's terms, and a link that opens the article
 * scrolled to the passage where browsers support text fragments.
 */
function Attribution(props: { claim: NewsClaim; article: NewsArticle }) {
  const { claim, article } = props
  const who =
    claim.speakerKind === 'author'
      ? `${article.publisher}, in its own reporting`
      : [claim.speaker, claim.speakerRole].filter(Boolean).join(', ')
  return (
    <Row className="text-ink-500 flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-3 text-xs">
      <span className="text-ink-700">— {who}</span>
      {claim.speakerKind !== 'author' && (
        <span>· quoted by {article.publisher}</span>
      )}
      <span>·</span>
      <a
        href={contextUrl(article.url, claim.excerpt)}
        target="_blank"
        rel="noreferrer"
        className="hover:text-primary-700 underline-offset-2 hover:underline"
      >
        Read in context ↗
      </a>
    </Row>
  )
}

// Text fragments (#:~:text=start,end) open the article scrolled to the
// quote. Dashes and commas carry meaning in the syntax, so encode them.
const fragment = (s: string) =>
  encodeURIComponent(s).replace(/-/g, '%2D').replace(/,/g, '%2C')

export function contextUrl(url: string, excerpt: string) {
  const words = excerpt
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return url
  const text =
    words.length <= 8
      ? fragment(words.join(' '))
      : `${fragment(words.slice(0, 4).join(' '))},${fragment(
          words.slice(-4).join(' ')
        )}`
  return `${url.split('#')[0]}#:~:text=${text}`
}

/** The market whose resolution turns on exactly what the quote claims. */
function DirectMatch(props: {
  contract: Contract
  storyId: string
  byReader: boolean
  storyCount?: number
}) {
  const { storyId, byReader, storyCount } = props
  const contract = useLiveContract(props.contract)
  return (
    <Col className="border-primary-300 bg-primary-50 gap-1.5 rounded-md border px-3 py-2.5">
      <span
        className="text-primary-700 text-[10px] font-bold uppercase tracking-wider"
        title="This market resolves on exactly what the quote claims."
      >
        Direct match{byReader ? ' · linked by a member' : ''}
      </span>
      <QuestionLink
        contract={contract}
        storyId={storyId}
        place="claim"
        className="text-ink-900 text-sm font-medium leading-snug"
      />
      <Row className="flex-wrap items-center justify-between gap-2">
        <Price contract={contract} size="lg" />
        <TradeButtons contract={contract} storyId={storyId} place="claim" />
      </Row>
      <MarketMeta contract={contract} storyCount={storyCount} />
    </Col>
  )
}

/** A market the reader just published from this claim. */
function Published(props: { market: SimulatedMarket }) {
  const { market } = props
  return (
    <Col className="gap-1.5 rounded-md border border-teal-300 bg-teal-50 px-3 py-2.5">
      <Row className="items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-teal-700">
        <CheckCircleIcon className="h-3.5 w-3.5" />
        Your market · direct match
      </Row>
      <span className="text-ink-900 text-sm font-medium leading-snug">
        {market.question}
      </span>
      <Row className="items-center gap-2">
        <span className="text-ink-400 decoration-ink-300 text-2xl font-semibold tabular-nums leading-none underline decoration-dotted underline-offset-4">
          50%
        </span>
        <EarlyBadge label="New · no trades yet" />
      </Row>
      <span className="text-ink-500 text-[11px] leading-snug">
        Closes {formatUtcDay(market.closeTime)}. Published just now by you.
      </span>
      <PrototypeNote />
    </Col>
  )
}

export function PrototypeNote(props: { className?: string; before?: boolean }) {
  return (
    <span className={clsx('text-ink-400 text-[11px] italic', props.className)}>
      {props.before
        ? 'Prototype: publishing is simulated; no market will be created.'
        : 'Prototype: publishing is simulated. No market was created.'}
    </span>
  )
}

/** A draft closes at the end of a UTC day; name that day. */
export const formatUtcDay = (t: number) =>
  new Date(t).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

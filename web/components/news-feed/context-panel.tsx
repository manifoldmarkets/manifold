import {
  ChatAlt2Icon,
  PlusIcon,
  TrendingUpIcon,
} from '@heroicons/react/outline'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'
import { NewsClaim, NewsStory } from 'common/news-feed'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ClaimRow, PrototypeNote } from './claim-row'
import type { SimulatedMarket } from './create-from-claim'
import { LinkMarket } from './link-market'
import { trackNews } from './news-events'
import { EarlyBadge, NewsMarketRow } from './news-market-row'

const OUTLOOK_ROWS = 3
const CLAIM_ROWS = 2

/**
 * Manifold's context for a story, opened from the card. Two uses, kept
 * apart:
 *
 * - Related outlook: markets on what happens next. They give context; their
 *   prices are not verdicts on what the article reports.
 * - Claims in this article: short quotes, word for word and attributed, each
 *   beside the market that tests exactly that claim, or a draft to publish.
 *
 * A story can have an outlook and no claims; the claims section then says
 * why in one line.
 */
export function ContextPanel(props: {
  id: string
  story: NewsStory
  contractsById: Record<string, Contract>
  storyCounts: Record<string, number>
  /** Markets the reader published from this story's claims. */
  published: SimulatedMarket[]
  onCreate: (claim: NewsClaim) => void
  /** A member linked a market; the feed should refetch. */
  onAttached: () => void
  createHref: string
  /** False when the server reads no articles: there is no claims section. */
  claimsEnabled?: boolean
}) {
  const {
    id,
    story,
    contractsById,
    storyCounts,
    published,
    onCreate,
    onAttached,
    createHref,
    claimsEnabled = true,
  } = props
  const claims = story.claims ?? []
  const directIds = new Set(
    claims.flatMap((c) => (c.matchId ? [c.matchId] : []))
  )
  const readerIds = new Set(story.readerContractIds ?? [])
  // The market featured on the folded card leads, so opening the card
  // doesn't move it.
  const outlook = uniq([
    ...(story.featuredId ? [story.featuredId] : []),
    ...story.contractIds,
    ...readerIds,
  ])
    .filter((cid) => !directIds.has(cid))
    .map((cid) => contractsById[cid])
    .filter((c): c is Contract => !!c)
  const publishedRelated = published.filter((m) => m.relation === 'related')

  return (
    <div
      id={id}
      className="border-ink-100 bg-canvas-50 flex flex-col gap-5 rounded-b-lg border-t px-3 pb-3 pt-3.5 sm:px-4"
    >
      <Section
        icon={<TrendingUpIcon className="h-4 w-4" />}
        title="Related outlook"
        hint="What traders expect next. These forecast what happens from here; they don't confirm or dispute what the article reports."
      >
        {outlook.length === 0 && publishedRelated.length === 0 ? (
          <p className="text-ink-500 text-sm">
            No forecasts beyond the claims below.
          </p>
        ) : (
          <Outlook
            storyId={story.id}
            outlook={outlook}
            readerIds={readerIds}
            published={publishedRelated}
            storyCounts={storyCounts}
          />
        )}
      </Section>

      {claimsEnabled && (
        <Claims
          story={story}
          contractsById={contractsById}
          storyCounts={storyCounts}
          published={published}
          onCreate={onCreate}
        />
      )}

      <Row className="text-ink-500 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <LinkMarket storyId={story.id} onAttached={onAttached} />
        <Link
          href={createHref}
          className="hover:text-primary-700 flex items-center gap-1 font-medium"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Ask your own question
        </Link>
      </Row>
    </div>
  )
}

function Section(props: {
  icon: ReactNode
  title: string
  hint?: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <Col className="gap-0.5">
        <Row className="items-center justify-between gap-2">
          <h3 className="text-ink-800 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <span className="text-ink-500">{props.icon}</span>
            {props.title}
          </h3>
          {props.right}
        </Row>
        {props.hint && (
          <p className="text-ink-500 text-xs leading-snug">{props.hint}</p>
        )}
      </Col>
      {props.children}
    </section>
  )
}

function Outlook(props: {
  storyId: string
  outlook: Contract[]
  readerIds: Set<string>
  published: SimulatedMarket[]
  storyCounts: Record<string, number>
}) {
  const { storyId, outlook, readerIds, published, storyCounts } = props
  const [all, setAll] = useState(false)
  const shown = all ? outlook : outlook.slice(0, OUTLOOK_ROWS)
  const hidden = outlook.length - shown.length
  return (
    <Col className="border-ink-200 bg-canvas-0 divide-ink-100 divide-y overflow-hidden rounded-md border">
      {published.map((m) => (
        <PublishedOutlookRow key={m.id} market={m} />
      ))}
      {shown.map((c) => (
        <NewsMarketRow
          key={c.id}
          contract={c}
          storyId={storyId}
          place="outlook"
          storyCount={storyCounts[c.id]}
          readerAdded={readerIds.has(c.id)}
        />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => {
            trackNews('news outlook more', { storyId, hidden })
            setAll(true)
          }}
          className="text-primary-700 hover:bg-canvas-50 w-full px-3 py-2 text-left text-xs font-medium"
        >
          Show {hidden} more {hidden === 1 ? 'forecast' : 'forecasts'}
        </button>
      )}
    </Col>
  )
}

/** A broader market the reader published from a claim, placed with the
 * outlook rather than beside the quote. */
function PublishedOutlookRow(props: { market: SimulatedMarket }) {
  const { market } = props
  return (
    <div className="bg-teal-50 px-3 py-2.5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <span className="text-ink-900 min-w-0 flex-1 text-sm leading-snug">
          {market.question}
        </span>
        <Row className="shrink-0 items-center gap-1.5 self-end sm:self-auto">
          <span className="text-ink-400 decoration-ink-300 text-sm font-semibold tabular-nums underline decoration-dotted underline-offset-4">
            50%
          </span>
          <EarlyBadge label="New · no trades yet" />
        </Row>
      </div>
      <Row className="mt-1 flex-wrap items-center gap-x-1.5 text-[11px]">
        <span className="text-teal-700">
          Your market, from a claim · published just now
        </span>
        <PrototypeNote />
      </Row>
    </div>
  )
}

function Claims(props: {
  story: NewsStory
  contractsById: Record<string, Contract>
  storyCounts: Record<string, number>
  published: SimulatedMarket[]
  onCreate: (claim: NewsClaim) => void
}) {
  const { story, contractsById, storyCounts, published, onCreate } = props
  const [all, setAll] = useState(false)
  const article = story.article
  // Every claim shown has a market beside it or a draft behind its button.
  const claims = (story.claims ?? []).filter((c) =>
    c.matchId ? !!contractsById[c.matchId] : !!c.draft
  )
  const status = story.claimsStatus

  const icon = <ChatAlt2Icon className="h-4 w-4" />
  if (!article || status === 'no-article' || status === 'pending' || !status) {
    return (
      <Section icon={icon} title="Claims in this article">
        <p className="text-ink-500 text-sm">
          {status === 'pending'
            ? 'Reading the article for claims a market could test…'
            : "Claims come from an article's full text, which we don't have for this story yet."}
        </p>
      </Section>
    )
  }

  const readLink = (
    <a
      href={article.url}
      target="_blank"
      rel="noreferrer"
      className="text-ink-500 hover:text-primary-700 inline-block max-w-[14rem] shrink-0 truncate text-xs"
      title={
        article.byline ? `${article.publisher} · ${article.byline}` : undefined
      }
    >
      {article.publisher}
      {article.byline && ` · ${article.byline}`} ↗
    </a>
  )
  if (claims.length === 0) {
    return (
      <Section icon={icon} title="Claims in this article" right={readLink}>
        <p className="text-ink-500 text-sm">
          We read the article and found no claim a market could settle on public
          evidence. The forecasts above still apply.
        </p>
      </Section>
    )
  }

  const shown = all ? claims : claims.slice(0, CLAIM_ROWS)
  const hidden = claims.length - shown.length
  return (
    <Section
      icon={icon}
      title="Claims in this article"
      right={readLink}
      hint="Quoted word for word. Beside each: the market that tests exactly that claim, or a draft you can review and publish."
    >
      <Col className="gap-2">
        {shown.map((c) => (
          <ClaimRow
            key={c.id}
            claim={c}
            storyId={story.id}
            article={article}
            match={c.matchId ? contractsById[c.matchId] : undefined}
            storyCounts={storyCounts}
            published={published.find(
              (m) => m.claimId === c.id && m.relation === 'direct'
            )}
            publishedRelated={published.some(
              (m) => m.claimId === c.id && m.relation === 'related'
            )}
            onCreate={() => onCreate(c)}
          />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => {
              trackNews('news claims more', { storyId: story.id, hidden })
              setAll(true)
            }}
            className="text-primary-700 self-start text-xs font-medium hover:underline"
          >
            Show {hidden} more {hidden === 1 ? 'claim' : 'claims'}
          </button>
        )}
      </Col>
    </Section>
  )
}

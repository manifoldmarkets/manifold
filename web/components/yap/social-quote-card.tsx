import Link from 'next/link'
import { SocialQuote } from 'common/social-post'
import { contractPath, getBinaryProbPercent } from 'common/contract'
import { Avatar } from '../widgets/avatar'
import { SocialImageCarousel } from './social-image-carousel'

export function SocialQuoteCard({ quote }: { quote: SocialQuote }) {
  if (quote.kind === 'market') return null
  if (quote.unavailable)
    return (
      <div className="border-ink-200 text-ink-600 mt-3 rounded-xl border p-3 text-sm">
        Original post unavailable.
      </div>
    )
  return (
    <div
      data-social-quote
      className="border-ink-200 dark:border-ink-300 bg-canvas-50/60 mt-3 overflow-hidden rounded-xl border p-3"
    >
      {quote.kind === 'bet' && (
        <Link
          href={quote.url}
          className="text-ink-600 mb-2 block text-xs hover:underline"
        >
          Shared trade
        </Link>
      )}
      {quote.author && (
        <Link
          href={`/${quote.author.username}`}
          className="mb-2 flex min-w-0 items-center gap-2 text-sm hover:underline"
        >
          <Avatar
            avatarUrl={quote.author.avatarUrl}
            username={quote.author.username}
            size="xs"
            noLink
          />
          <span className="text-ink-900 truncate font-semibold">
            {quote.author.name}
          </span>
          <span className="text-ink-600 truncate">
            @{quote.author.username}
          </span>
        </Link>
      )}
      {!!quote.text && (
        <Link
          href={quote.url}
          className="text-ink-900 block whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]"
        >
          {quote.text}
        </Link>
      )}
      {!!quote.imageUrls?.length && (
        <SocialImageCarousel
          key={quote.imageUrls.join('|')}
          images={quote.imageUrls}
        />
      )}
      {!!quote.markets?.length && (
        <div className="mt-3 space-y-2">
          {quote.markets.map((market) => (
            <Link
              key={market.id}
              href={contractPath(market)}
              className="border-ink-200 hover:bg-canvas-50 flex items-center justify-between gap-3 rounded-lg border p-2 text-sm"
            >
              <span className="min-w-0 break-words">{market.question}</span>
              {market.outcomeType === 'BINARY' && !market.isResolved && (
                <span className="text-primary-700 shrink-0 font-semibold">
                  {getBinaryProbPercent(market)}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
      {(quote.includesQuote || (quote.kind === 'post' && !quote.text)) && (
        <Link
          href={quote.url}
          className="text-primary-700 mt-2 block text-xs hover:underline"
        >
          {quote.includesQuote ? 'View included quote' : 'View original post'}
        </Link>
      )}
    </div>
  )
}

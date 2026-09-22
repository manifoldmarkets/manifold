import Link from 'next/link'
import { SocialQuote } from 'common/social-post'
import { contractPath, getBinaryProbPercent } from 'common/contract'
import { SocialAvatar } from './social-avatar'
import { SocialUserLink } from './social-user-link'
import { SocialImageCarousel } from './social-image-carousel'
import { SocialRichContent } from './social-rich-content'

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
        <div className="mb-2 flex min-w-0 items-center gap-2 text-sm">
          <SocialAvatar user={quote.author} size="xs" />
          <SocialUserLink
            user={quote.author}
            className="text-ink-900 min-w-0 truncate font-semibold"
          />
          <SocialUserLink
            user={quote.author}
            label="handle"
            className="text-ink-600 min-w-0 truncate"
          />
        </div>
      )}
      {quote.richContent ? (
        <SocialRichContent
          content={quote.richContent}
          fallbackText={quote.text}
          className="text-sm"
        />
      ) : (
        !!quote.text && (
          <Link
            href={quote.url}
            className="text-ink-900 block whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]"
          >
            {quote.text}
          </Link>
        )
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
      {(quote.includesQuote ||
        !!quote.richContent ||
        (quote.kind === 'post' && !quote.text)) && (
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

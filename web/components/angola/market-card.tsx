// ============================================================================
// MARKET CARD COMPONENT
// ============================================================================
// Simplified market card for displaying YES/NO markets
// ============================================================================

import Link from 'next/link'
import { AngolaMarketLite } from 'common/types/angola-types'
import { formatAOA, formatAOACompact } from 'common/envs/angola'

type MarketCardProps = {
  market: AngolaMarketLite
  showCreator?: boolean
  className?: string
}

export function MarketCard({
  market,
  showCreator = true,
  className = '',
}: MarketCardProps) {
  const prob = Math.round(market.prob * 100)
  const probChangeDay = market.probChanges?.day
    ? Math.round(market.probChanges.day * 100)
    : 0

  const isClosingSoon =
    market.closeTime && market.closeTime - Date.now() < 24 * 60 * 60 * 1000

  return (
    <Link
      href={`/market/${market.slug}`}
      className={`block bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all p-4 ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-medium text-gray-900 line-clamp-2 flex-1">
          {market.question}
        </h3>

        {/* Probability Badge */}
        <div className="flex-shrink-0">
          <div
            className={`text-2xl font-bold ${
              prob >= 50 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {prob}%
          </div>
          {probChangeDay !== 0 && (
            <div
              className={`text-xs text-center ${
                probChangeDay > 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {probChangeDay > 0 ? '+' : ''}
              {probChangeDay}%
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        {showCreator && market.creatorUsername && (
          <div className="flex items-center gap-1">
            {market.creatorAvatarUrl && (
              <img
                src={market.creatorAvatarUrl}
                alt=""
                className="w-4 h-4 rounded-full"
              />
            )}
            <span className="truncate max-w-[100px]">
              @{market.creatorUsername}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <VolumeIcon />
          <span>{formatAOACompact(market.volume)}</span>
        </div>

        <div className="flex items-center gap-1">
          <UsersIcon />
          <span>{market.uniqueBettorsCount}</span>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 mt-3">
        {market.isResolved && (
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${
              market.resolution === 'YES'
                ? 'bg-green-100 text-green-700'
                : market.resolution === 'NO'
                ? 'bg-red-100 text-red-700'
                : market.resolution === 'CANCEL'
                ? 'bg-gray-100 text-gray-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {market.resolution === 'MKT' ? 'MKT' : market.resolution}
          </span>
        )}

        {isClosingSoon && !market.isResolved && (
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-700">
            Fecha em breve
          </span>
        )}
      </div>
    </Link>
  )
}

// ============================================================================
// MARKET LIST COMPONENT
// ============================================================================

type MarketListProps = {
  markets: AngolaMarketLite[]
  isLoading?: boolean
  emptyMessage?: string
}

export function MarketList({
  markets,
  isLoading,
  emptyMessage = 'Nenhum mercado encontrado',
}: MarketListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">{emptyMessage}</div>
    )
  }

  return (
    <div className="space-y-4">
      {markets.map((market) => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  )
}

// ============================================================================
// SKELETON LOADER
// ============================================================================

function MarketCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
        <div className="h-8 w-16 bg-gray-200 rounded" />
      </div>
      <div className="flex items-center gap-4">
        <div className="h-4 w-20 bg-gray-200 rounded" />
        <div className="h-4 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-12 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

// ============================================================================
// ICONS
// ============================================================================

function VolumeIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
      />
    </svg>
  )
}

export default MarketCard

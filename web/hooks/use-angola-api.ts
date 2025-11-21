// ============================================================================
// ANGOLA API HOOK
// ============================================================================
// React hooks for interacting with the Angola API
// ============================================================================

import { useState, useCallback } from 'react'
import useSWR, { mutate } from 'swr'
import { getAuthToken } from 'web/lib/supabase/db'
import { getAngolaConfig } from 'common/envs/angola'
import {
  AngolaMarket,
  AngolaMarketLite,
  AngolaBet,
  CreateMarketRequest,
  PlaceBetRequest,
  SellSharesRequest,
  ResolveMarketRequest,
  BetOutcome,
} from 'common/types/angola-types'

const config = getAngolaConfig()
const API_BASE = `https://${config.apiEndpoint}`

// ============================================================================
// API CLIENT
// ============================================================================

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

async function apiCall<T>(
  endpoint: string,
  method: ApiMethod = 'GET',
  body?: any
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const token = await getAuthToken()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.error?.message || 'Erro na requisicao',
      }
    }

    return { success: true, data: json.data }
  } catch (err) {
    console.error('API call error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro de conexao',
    }
  }
}

// SWR fetcher
const fetcher = async <T>(url: string): Promise<T> => {
  const result = await apiCall<T>(url)
  if (!result.success) {
    throw new Error(result.error)
  }
  return result.data
}

// ============================================================================
// MARKET HOOKS
// ============================================================================

export function useMarket(marketId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<AngolaMarket>(
    marketId ? `/markets/${marketId}` : null,
    fetcher,
    {
      refreshInterval: 5000, // Refresh every 5 seconds
      revalidateOnFocus: true,
    }
  )

  return {
    market: data,
    isLoading,
    error: error?.message,
    refresh: mutate,
  }
}

export type MarketsFilter = {
  status?: 'open' | 'closed' | 'resolved' | 'all'
  sort?: 'newest' | 'volume' | 'popularity' | 'closing-soon'
  search?: string
  creatorId?: string
  limit?: number
}

export function useMarkets(filter: MarketsFilter = {}) {
  const params = new URLSearchParams()
  if (filter.status) params.set('status', filter.status)
  if (filter.sort) params.set('sort', filter.sort)
  if (filter.search) params.set('search', filter.search)
  if (filter.creatorId) params.set('creatorId', filter.creatorId)
  if (filter.limit) params.set('limit', filter.limit.toString())

  const queryString = params.toString()
  const url = `/markets${queryString ? `?${queryString}` : ''}`

  const { data, error, isLoading, mutate } = useSWR<{
    markets: AngolaMarketLite[]
    nextCursor?: string
  }>(url, fetcher, {
    refreshInterval: 10000,
  })

  return {
    markets: data?.markets || [],
    nextCursor: data?.nextCursor,
    isLoading,
    error: error?.message,
    refresh: mutate,
  }
}

// ============================================================================
// CREATE MARKET HOOK
// ============================================================================

export function useCreateMarket() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createMarket = useCallback(
    async (
      request: CreateMarketRequest
    ): Promise<AngolaMarket | null> => {
      setIsLoading(true)
      setError(null)

      const result = await apiCall<{ market: AngolaMarket }>(
        '/markets',
        'POST',
        request
      )

      setIsLoading(false)

      if (!result.success) {
        setError(result.error)
        return null
      }

      // Invalidate markets list cache
      mutate((key) => typeof key === 'string' && key.startsWith('/markets'))

      return result.data.market
    },
    []
  )

  return { createMarket, isLoading, error }
}

// ============================================================================
// BETTING HOOKS
// ============================================================================

export function usePlaceBet() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const placeBet = useCallback(
    async (
      request: PlaceBetRequest
    ): Promise<{ bet: AngolaBet; newBalance: number } | null> => {
      setIsLoading(true)
      setError(null)

      const result = await apiCall<{ bet: AngolaBet; newBalance: number }>(
        '/bets',
        'POST',
        request
      )

      setIsLoading(false)

      if (!result.success) {
        setError(result.error)
        return null
      }

      // Invalidate market and portfolio caches
      mutate(`/markets/${request.marketId}`)
      mutate('/user/portfolio')
      mutate((key) => typeof key === 'string' && key.startsWith('/user/bets'))

      return result.data
    },
    []
  )

  return { placeBet, isLoading, error, clearError: () => setError(null) }
}

export function useSellShares() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sellShares = useCallback(
    async (
      request: SellSharesRequest
    ): Promise<{ bet: AngolaBet; newBalance: number; sharesSold: number } | null> => {
      setIsLoading(true)
      setError(null)

      const result = await apiCall<{
        bet: AngolaBet
        newBalance: number
        sharesSold: number
      }>('/sell', 'POST', request)

      setIsLoading(false)

      if (!result.success) {
        setError(result.error)
        return null
      }

      // Invalidate caches
      mutate(`/markets/${request.marketId}`)
      mutate('/user/portfolio')
      mutate((key) => typeof key === 'string' && key.startsWith('/user/bets'))

      return result.data
    },
    []
  )

  return { sellShares, isLoading, error, clearError: () => setError(null) }
}

// ============================================================================
// RESOLVE MARKET HOOK
// ============================================================================

export function useResolveMarket() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolveMarket = useCallback(
    async (
      marketId: string,
      request: ResolveMarketRequest
    ): Promise<{
      market: AngolaMarket
      payoutsCount: number
      totalPayout: number
    } | null> => {
      setIsLoading(true)
      setError(null)

      const result = await apiCall<{
        market: AngolaMarket
        payoutsCount: number
        totalPayout: number
      }>(`/markets/${marketId}/resolve`, 'POST', request)

      setIsLoading(false)

      if (!result.success) {
        setError(result.error)
        return null
      }

      // Invalidate caches
      mutate(`/markets/${marketId}`)
      mutate((key) => typeof key === 'string' && key.startsWith('/markets'))

      return result.data
    },
    []
  )

  return { resolveMarket, isLoading, error }
}

// ============================================================================
// USER HOOKS
// ============================================================================

export function useUserPortfolio() {
  const { data, error, isLoading, mutate } = useSWR<{
    positions: any[]
    totalValue: number
    totalProfitLoss: number
  }>('/user/portfolio', fetcher, {
    refreshInterval: 10000,
  })

  return {
    positions: data?.positions || [],
    totalValue: data?.totalValue || 0,
    totalProfitLoss: data?.totalProfitLoss || 0,
    isLoading,
    error: error?.message,
    refresh: mutate,
  }
}

export function useUserBets(marketId?: string) {
  const params = new URLSearchParams()
  if (marketId) params.set('marketId', marketId)

  const queryString = params.toString()
  const url = `/user/bets${queryString ? `?${queryString}` : ''}`

  const { data, error, isLoading, mutate } = useSWR<{
    bets: AngolaBet[]
    nextCursor?: string
  }>(url, fetcher, {
    refreshInterval: 10000,
  })

  return {
    bets: data?.bets || [],
    nextCursor: data?.nextCursor,
    isLoading,
    error: error?.message,
    refresh: mutate,
  }
}

export function useCurrentUser() {
  const { data, error, isLoading, mutate } = useSWR('/user/me', fetcher)

  return {
    user: data,
    isLoading,
    error: error?.message,
    refresh: mutate,
  }
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

export function useMarketBetPreview(
  market: AngolaMarket | undefined,
  outcome: BetOutcome,
  amount: number
) {
  // Calculate bet preview locally without API call
  if (!market || amount <= 0) {
    return {
      shares: 0,
      probAfter: market?.prob || 0.5,
      avgPrice: 0,
      potentialPayout: 0,
    }
  }

  // Simplified calculation for preview
  const currentProb = market.prob
  const effectiveProb = outcome === 'YES' ? currentProb : 1 - currentProb

  // Rough estimate of shares
  const avgPrice = effectiveProb
  const shares = amount / avgPrice

  // Estimate probability change
  const probChange = (amount / (market.totalLiquidity * 10)) * (outcome === 'YES' ? 1 : -1)
  const probAfter = Math.max(0.01, Math.min(0.99, currentProb + probChange))

  return {
    shares: shares,
    probAfter,
    avgPrice,
    potentialPayout: shares, // 1 AOA per share if wins
  }
}

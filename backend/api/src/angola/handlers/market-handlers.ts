// ============================================================================
// MARKET HANDLERS
// ============================================================================
// Handlers for market-related endpoints
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'
import slugify from 'slugify'
import {
  CreateMarketSchema,
  ResolveMarketSchema,
  ListMarketsSchema,
  successResponse,
  errorResponse,
  ERROR_CODES,
} from '../routes'
import {
  createInitialPool,
  getCpmmProbability,
  calculateAllPayouts,
} from 'common/calculate-cpmm-simple'
import {
  AngolaMarket,
  AngolaMarketLite,
  MarketResolution,
} from 'common/types/angola-types'
import { getAngolaConfig } from 'common/envs/angola'

const config = getAngolaConfig()

// ============================================================================
// CREATE MARKET
// ============================================================================

export type CreateMarketInput = {
  question: string
  description?: string
  initialProbability: number
  closeTime?: number
  visibility: 'public' | 'unlisted'
  initialLiquidity: number
}

export async function createMarket(
  db: any, // Supabase client
  userId: string,
  input: CreateMarketInput
): Promise<{ success: true; market: AngolaMarket } | { success: false; error: any }> {
  // Validate user has enough balance
  const { data: user, error: userError } = await db
    .from('users')
    .select('id, balance, username, name, avatar_url')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.USER_NOT_FOUND, 'Usuario nao encontrado'),
    }
  }

  if (user.balance < input.initialLiquidity) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.INSUFFICIENT_BALANCE,
        `Saldo insuficiente. Necessario: Kz ${input.initialLiquidity}, Disponivel: Kz ${user.balance}`
      ),
    }
  }

  // Generate slug
  const baseSlug = slugify(input.question, {
    lower: true,
    strict: true,
    locale: 'pt',
  }).slice(0, 50)
  const slug = `${baseSlug}-${nanoid(6)}`

  // Create initial pool
  const { pool, p } = createInitialPool(
    input.initialProbability,
    input.initialLiquidity
  )

  const marketId = crypto.randomUUID()
  const now = Date.now()

  const market: Partial<AngolaMarket> = {
    id: marketId,
    slug,
    creatorId: userId,
    creatorUsername: user.username,
    creatorName: user.name,
    creatorAvatarUrl: user.avatar_url,
    question: input.question,
    description: input.description || '',
    visibility: input.visibility,
    initialProbability: input.initialProbability,
    pool,
    p,
    prob: getCpmmProbability(pool, p),
    probChanges: { day: 0, week: 0, month: 0 },
    totalLiquidity: input.initialLiquidity,
    subsidyPool: input.initialLiquidity,
    volume: 0,
    volume24Hours: 0,
    uniqueBettorsCount: 0,
    collectedFees: { creatorFee: 0, platformFee: 0, liquidityFee: 0 },
    isResolved: false,
    popularityScore: 0,
    importanceScore: 0,
    viewCount: 0,
    createdTime: now,
    lastUpdatedTime: now,
    closeTime: input.closeTime,
  }

  // Start transaction
  // Deduct liquidity from user balance
  const { error: balanceError } = await db
    .from('users')
    .update({ balance: user.balance - input.initialLiquidity })
    .eq('id', userId)
    .eq('balance', user.balance) // Optimistic locking

  if (balanceError) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.DATABASE_ERROR,
        'Erro ao atualizar saldo'
      ),
    }
  }

  // Insert market
  const { data: insertedMarket, error: insertError } = await db
    .from('markets')
    .insert(market)
    .select()
    .single()

  if (insertError) {
    // Rollback balance change
    await db
      .from('users')
      .update({ balance: user.balance })
      .eq('id', userId)

    return {
      success: false,
      error: errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao criar mercado'),
    }
  }

  // Create transaction record
  await db.from('transactions').insert({
    user_id: userId,
    type: 'MARKET_CREATION',
    amount: -input.initialLiquidity,
    balance_before: user.balance,
    balance_after: user.balance - input.initialLiquidity,
    market_id: marketId,
    description: `Criacao de mercado: ${input.question}`,
  })

  return { success: true, market: insertedMarket as AngolaMarket }
}

// ============================================================================
// GET MARKET
// ============================================================================

export async function getMarket(
  db: any,
  marketId: string
): Promise<{ success: true; market: AngolaMarket } | { success: false; error: any }> {
  const { data: market, error } = await db
    .from('markets')
    .select('*')
    .eq('id', marketId)
    .eq('is_deleted', false)
    .single()

  if (error || !market) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.MARKET_NOT_FOUND,
        'Mercado nao encontrado'
      ),
    }
  }

  // Increment view count
  await db
    .from('markets')
    .update({ view_count: market.view_count + 1 })
    .eq('id', marketId)

  return { success: true, market: market as AngolaMarket }
}

// ============================================================================
// LIST MARKETS
// ============================================================================

export type ListMarketsInput = {
  limit: number
  cursor?: string
  status: 'open' | 'closed' | 'resolved' | 'all'
  sort: 'newest' | 'volume' | 'popularity' | 'closing-soon'
  creatorId?: string
  search?: string
}

export async function listMarkets(
  db: any,
  input: ListMarketsInput
): Promise<{ success: true; markets: AngolaMarketLite[]; nextCursor?: string } | { success: false; error: any }> {
  let query = db
    .from('markets')
    .select(
      'id, slug, question, creator_username, creator_avatar_url, prob, prob_changes, volume, unique_bettors_count, is_resolved, resolution, close_time, created_time'
    )
    .eq('is_deleted', false)
    .eq('visibility', 'public')

  // Filter by status
  const now = Date.now()
  switch (input.status) {
    case 'open':
      query = query
        .eq('is_resolved', false)
        .or(`close_time.is.null,close_time.gt.${now}`)
      break
    case 'closed':
      query = query.eq('is_resolved', false).lt('close_time', now)
      break
    case 'resolved':
      query = query.eq('is_resolved', true)
      break
  }

  // Filter by creator
  if (input.creatorId) {
    query = query.eq('creator_id', input.creatorId)
  }

  // Search
  if (input.search) {
    query = query.textSearch('question', input.search)
  }

  // Sorting
  switch (input.sort) {
    case 'newest':
      query = query.order('created_time', { ascending: false })
      break
    case 'volume':
      query = query.order('volume', { ascending: false })
      break
    case 'popularity':
      query = query.order('popularity_score', { ascending: false })
      break
    case 'closing-soon':
      query = query
        .not('close_time', 'is', null)
        .gt('close_time', now)
        .order('close_time', { ascending: true })
      break
  }

  // Pagination
  if (input.cursor) {
    query = query.gt('created_time', input.cursor)
  }

  query = query.limit(input.limit + 1) // Get one extra to check if there's more

  const { data: markets, error } = await query

  if (error) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao buscar mercados'),
    }
  }

  const hasMore = markets.length > input.limit
  const resultMarkets = hasMore ? markets.slice(0, input.limit) : markets
  const nextCursor = hasMore
    ? resultMarkets[resultMarkets.length - 1].created_time
    : undefined

  return {
    success: true,
    markets: resultMarkets as AngolaMarketLite[],
    nextCursor,
  }
}

// ============================================================================
// RESOLVE MARKET
// ============================================================================

export type ResolveMarketInput = {
  resolution: MarketResolution
  resolutionProbability?: number
  notes?: string
}

export async function resolveMarket(
  db: any,
  userId: string,
  marketId: string,
  input: ResolveMarketInput
): Promise<{ success: true; market: AngolaMarket; payoutsCount: number; totalPayout: number } | { success: false; error: any }> {
  // Get market and verify ownership
  const { data: market, error: marketError } = await db
    .from('markets')
    .select('*')
    .eq('id', marketId)
    .single()

  if (marketError || !market) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.MARKET_NOT_FOUND,
        'Mercado nao encontrado'
      ),
    }
  }

  // Check if user can resolve (creator or admin)
  const { data: user } = await db
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single()

  if (market.creator_id !== userId && !user?.is_admin) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.FORBIDDEN,
        'Apenas o criador ou admin pode resolver este mercado'
      ),
    }
  }

  if (market.is_resolved) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.MARKET_RESOLVED,
        'Mercado ja foi resolvido'
      ),
    }
  }

  // Validate MKT resolution has probability
  if (input.resolution === 'MKT' && input.resolutionProbability === undefined) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.INVALID_RESOLUTION,
        'Resolucao MKT requer probabilidade'
      ),
    }
  }

  // Get all bets for payout calculation
  const { data: bets } = await db
    .from('bets')
    .select('*')
    .eq('market_id', marketId)
    .eq('is_redemption', false)

  // Calculate payouts
  const payoutsByUser = calculateAllPayouts(
    bets || [],
    input.resolution,
    input.resolutionProbability
  )

  // Process payouts
  let totalPayout = 0
  let payoutsCount = 0

  for (const [recipientUserId, payout] of payoutsByUser) {
    if (payout <= 0) continue

    totalPayout += payout
    payoutsCount++

    // Update user balance
    const { data: recipient } = await db
      .from('users')
      .select('balance')
      .eq('id', recipientUserId)
      .single()

    if (recipient) {
      await db
        .from('users')
        .update({ balance: recipient.balance + payout })
        .eq('id', recipientUserId)

      // Create transaction
      await db.from('transactions').insert({
        user_id: recipientUserId,
        type: 'PAYOUT',
        amount: payout,
        balance_before: recipient.balance,
        balance_after: recipient.balance + payout,
        market_id: marketId,
        description: `Pagamento de mercado resolvido: ${market.question}`,
      })
    }
  }

  // Update market
  const now = Date.now()
  const { data: updatedMarket, error: updateError } = await db
    .from('markets')
    .update({
      is_resolved: true,
      resolution: input.resolution,
      resolution_probability: input.resolutionProbability,
      resolution_time: now,
      resolver_id: userId,
      resolution_notes: input.notes,
      last_updated_time: now,
    })
    .eq('id', marketId)
    .select()
    .single()

  if (updateError) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao resolver mercado'),
    }
  }

  // Create resolution record
  await db.from('market_resolutions').insert({
    market_id: marketId,
    resolver_id: userId,
    resolution: input.resolution,
    resolution_probability: input.resolutionProbability,
    notes: input.notes,
    total_payout: totalPayout,
    payouts_count: payoutsCount,
  })

  return {
    success: true,
    market: updatedMarket as AngolaMarket,
    payoutsCount,
    totalPayout,
  }
}

// ============================================================================
// BET HANDLERS
// ============================================================================
// Handlers for betting-related endpoints
// ============================================================================

import {
  successResponse,
  errorResponse,
  ERROR_CODES,
} from '../routes'
import {
  calculateBet,
  calculateSell,
  getCpmmProbability,
  getTotalFees,
  validateBetAmount,
} from 'common/calculate-cpmm-simple'
import { AngolaBet, BetOutcome } from 'common/types/angola-types'
import { nanoid } from 'nanoid'

// ============================================================================
// PLACE BET
// ============================================================================

export type PlaceBetInput = {
  marketId: string
  outcome: BetOutcome
  amount: number
  limitProb?: number
}

export async function placeBet(
  db: any,
  userId: string,
  input: PlaceBetInput
): Promise<{ success: true; bet: AngolaBet; newBalance: number } | { success: false; error: any }> {
  // Validate amount
  const validation = validateBetAmount(input.amount)
  if (!validation.valid) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.MIN_BET_AMOUNT, validation.error!),
    }
  }

  // Get user balance
  const { data: user, error: userError } = await db
    .from('users')
    .select('id, balance')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.USER_NOT_FOUND, 'Usuario nao encontrado'),
    }
  }

  if (user.balance < input.amount) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.INSUFFICIENT_BALANCE,
        `Saldo insuficiente. Necessario: Kz ${input.amount}, Disponivel: Kz ${user.balance}`
      ),
    }
  }

  // Get market
  const { data: market, error: marketError } = await db
    .from('markets')
    .select('*')
    .eq('id', input.marketId)
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

  // Check market is open
  if (market.is_resolved) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.MARKET_RESOLVED,
        'Mercado ja foi resolvido'
      ),
    }
  }

  if (market.close_time && market.close_time < Date.now()) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.MARKET_CLOSED,
        'Mercado esta fechado para apostas'
      ),
    }
  }

  // Calculate bet
  const pool = { YES: market.pool_yes, NO: market.pool_no }
  const betCalc = calculateBet(pool, market.p, input.amount, input.outcome)

  // Check limit order condition
  if (input.limitProb !== undefined) {
    const currentProb = getCpmmProbability(pool, market.p)
    if (input.outcome === 'YES' && currentProb > input.limitProb) {
      return {
        success: false,
        error: errorResponse(
          ERROR_CODES.INVALID_INPUT,
          `Probabilidade atual (${(currentProb * 100).toFixed(1)}%) ja esta acima do limite`
        ),
      }
    }
    if (input.outcome === 'NO' && currentProb < input.limitProb) {
      return {
        success: false,
        error: errorResponse(
          ERROR_CODES.INVALID_INPUT,
          `Probabilidade atual (${(currentProb * 100).toFixed(1)}%) ja esta abaixo do limite`
        ),
      }
    }
  }

  const betId = nanoid(12)
  const now = Date.now()

  const bet: Partial<AngolaBet> = {
    id: betId,
    userId,
    marketId: input.marketId,
    outcome: input.outcome,
    amount: input.amount,
    shares: betCalc.shares,
    probBefore: betCalc.probBefore,
    probAfter: betCalc.probAfter,
    fees: betCalc.fees,
    isLimitOrder: input.limitProb !== undefined,
    limitProb: input.limitProb,
    isFilled: true,
    isRedemption: false,
    isApi: false,
    createdTime: now,
    updatedTime: now,
  }

  // Deduct from user balance
  const newBalance = user.balance - input.amount
  const { error: balanceError } = await db
    .from('users')
    .update({
      balance: newBalance,
      last_bet_at: now,
      total_bets_count: user.total_bets_count + 1,
    })
    .eq('id', userId)
    .eq('balance', user.balance) // Optimistic locking

  if (balanceError) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.DATABASE_ERROR,
        'Erro ao atualizar saldo. Tente novamente.'
      ),
    }
  }

  // Insert bet
  const { data: insertedBet, error: betError } = await db
    .from('bets')
    .insert(bet)
    .select()
    .single()

  if (betError) {
    // Rollback balance
    await db
      .from('users')
      .update({ balance: user.balance })
      .eq('id', userId)

    return {
      success: false,
      error: errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao registrar aposta'),
    }
  }

  // Update market pool and stats
  const totalFees = getTotalFees(betCalc.fees)
  await db
    .from('markets')
    .update({
      pool_yes: betCalc.newPool.YES,
      pool_no: betCalc.newPool.NO,
      prob: betCalc.probAfter,
      volume: market.volume + input.amount,
      last_bet_time: now,
      last_updated_time: now,
      fees_creator: market.fees_creator + betCalc.fees.creatorFee,
      fees_platform: market.fees_platform + betCalc.fees.platformFee,
    })
    .eq('id', input.marketId)

  // Create transaction record
  await db.from('transactions').insert({
    user_id: userId,
    type: 'BET',
    amount: -input.amount,
    balance_before: user.balance,
    balance_after: newBalance,
    market_id: input.marketId,
    bet_id: betId,
    description: `Aposta ${input.outcome} em: ${market.question}`,
  })

  return {
    success: true,
    bet: insertedBet as AngolaBet,
    newBalance,
  }
}

// ============================================================================
// SELL SHARES
// ============================================================================

export type SellSharesInput = {
  marketId: string
  outcome: BetOutcome
  shares?: number // If not specified, sell all
}

export async function sellShares(
  db: any,
  userId: string,
  input: SellSharesInput
): Promise<{ success: true; bet: AngolaBet; newBalance: number; sharesSold: number } | { success: false; error: any }> {
  // Get user's position in this market
  const { data: positions } = await db
    .from('bets')
    .select('outcome, shares')
    .eq('user_id', userId)
    .eq('market_id', input.marketId)
    .eq('is_redemption', false)

  // Calculate total shares by outcome
  let totalShares = 0
  for (const pos of positions || []) {
    if (pos.outcome === input.outcome) {
      totalShares += pos.shares
    }
  }

  const sharesToSell = input.shares ?? totalShares

  if (sharesToSell <= 0 || sharesToSell > totalShares) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.NO_SHARES_TO_SELL,
        `Voce nao tem shares suficientes. Disponivel: ${totalShares.toFixed(2)}`
      ),
    }
  }

  // Get market
  const { data: market, error: marketError } = await db
    .from('markets')
    .select('*')
    .eq('id', input.marketId)
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

  if (market.is_resolved) {
    return {
      success: false,
      error: errorResponse(
        ERROR_CODES.MARKET_RESOLVED,
        'Mercado ja foi resolvido'
      ),
    }
  }

  // Calculate sale
  const pool = { YES: market.pool_yes, NO: market.pool_no }
  const saleCalc = calculateSell(pool, market.p, sharesToSell, input.outcome)

  // Get user
  const { data: user } = await db
    .from('users')
    .select('balance')
    .eq('id', userId)
    .single()

  if (!user) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.USER_NOT_FOUND, 'Usuario nao encontrado'),
    }
  }

  const betId = nanoid(12)
  const now = Date.now()

  // Create sell bet (negative shares)
  const sellBet: Partial<AngolaBet> = {
    id: betId,
    userId,
    marketId: input.marketId,
    outcome: input.outcome,
    amount: saleCalc.saleAmount, // Positive (money received)
    shares: -sharesToSell, // Negative (shares sold)
    probBefore: saleCalc.probBefore,
    probAfter: saleCalc.probAfter,
    fees: saleCalc.fees,
    isRedemption: false,
    createdTime: now,
    updatedTime: now,
  }

  const newBalance = user.balance + saleCalc.saleAmount

  // Update user balance
  const { error: balanceError } = await db
    .from('users')
    .update({ balance: newBalance })
    .eq('id', userId)

  if (balanceError) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao atualizar saldo'),
    }
  }

  // Insert sell bet
  const { data: insertedBet, error: betError } = await db
    .from('bets')
    .insert(sellBet)
    .select()
    .single()

  if (betError) {
    // Rollback
    await db
      .from('users')
      .update({ balance: user.balance })
      .eq('id', userId)

    return {
      success: false,
      error: errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao registrar venda'),
    }
  }

  // Update market pool
  await db
    .from('markets')
    .update({
      pool_yes: saleCalc.newPool.YES,
      pool_no: saleCalc.newPool.NO,
      prob: saleCalc.probAfter,
      volume: market.volume + saleCalc.saleAmount,
      last_bet_time: now,
      last_updated_time: now,
    })
    .eq('id', input.marketId)

  // Create transaction
  await db.from('transactions').insert({
    user_id: userId,
    type: 'BET_SALE',
    amount: saleCalc.saleAmount,
    balance_before: user.balance,
    balance_after: newBalance,
    market_id: input.marketId,
    bet_id: betId,
    description: `Venda de shares ${input.outcome} em: ${market.question}`,
  })

  return {
    success: true,
    bet: insertedBet as AngolaBet,
    newBalance,
    sharesSold: sharesToSell,
  }
}

// ============================================================================
// GET USER BETS
// ============================================================================

export type GetUserBetsInput = {
  limit: number
  cursor?: string
  marketId?: string
}

export async function getUserBets(
  db: any,
  userId: string,
  input: GetUserBetsInput
): Promise<{ success: true; bets: AngolaBet[]; nextCursor?: string } | { success: false; error: any }> {
  let query = db
    .from('bets')
    .select('*, markets:market_id(question, slug, is_resolved, resolution)')
    .eq('user_id', userId)
    .order('created_time', { ascending: false })

  if (input.marketId) {
    query = query.eq('market_id', input.marketId)
  }

  if (input.cursor) {
    query = query.lt('created_time', input.cursor)
  }

  query = query.limit(input.limit + 1)

  const { data: bets, error } = await query

  if (error) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao buscar apostas'),
    }
  }

  const hasMore = bets.length > input.limit
  const resultBets = hasMore ? bets.slice(0, input.limit) : bets
  const nextCursor = hasMore
    ? resultBets[resultBets.length - 1].created_time
    : undefined

  return {
    success: true,
    bets: resultBets as AngolaBet[],
    nextCursor,
  }
}

// ============================================================================
// GET USER PORTFOLIO
// ============================================================================

export type PortfolioPosition = {
  marketId: string
  marketQuestion: string
  marketSlug: string
  isResolved: boolean
  resolution?: string
  currentProb: number
  yesShares: number
  noShares: number
  totalInvested: number
  currentValue: number
  profitLoss: number
  betsCount: number
}

export async function getUserPortfolio(
  db: any,
  userId: string
): Promise<{ success: true; positions: PortfolioPosition[]; totalValue: number; totalProfitLoss: number } | { success: false; error: any }> {
  // Get all user bets grouped by market
  const { data: bets, error } = await db
    .from('bets')
    .select('*, markets:market_id(id, question, slug, is_resolved, resolution, prob)')
    .eq('user_id', userId)
    .eq('is_redemption', false)

  if (error) {
    return {
      success: false,
      error: errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao buscar portfolio'),
    }
  }

  // Aggregate positions by market
  const positionsMap = new Map<string, PortfolioPosition>()

  for (const bet of bets || []) {
    const market = bet.markets
    if (!market) continue

    let position = positionsMap.get(market.id)
    if (!position) {
      position = {
        marketId: market.id,
        marketQuestion: market.question,
        marketSlug: market.slug,
        isResolved: market.is_resolved,
        resolution: market.resolution,
        currentProb: market.prob,
        yesShares: 0,
        noShares: 0,
        totalInvested: 0,
        currentValue: 0,
        profitLoss: 0,
        betsCount: 0,
      }
      positionsMap.set(market.id, position)
    }

    if (bet.outcome === 'YES') {
      position.yesShares += bet.shares
    } else {
      position.noShares += bet.shares
    }

    position.totalInvested += bet.amount
    position.betsCount++
  }

  // Calculate current values
  const positions: PortfolioPosition[] = []
  let totalValue = 0
  let totalProfitLoss = 0

  for (const position of positionsMap.values()) {
    // Only include positions with shares
    if (Math.abs(position.yesShares) < 0.0001 && Math.abs(position.noShares) < 0.0001) {
      continue
    }

    if (position.isResolved) {
      // Calculate payout for resolved market
      if (position.resolution === 'YES') {
        position.currentValue = position.yesShares
      } else if (position.resolution === 'NO') {
        position.currentValue = position.noShares
      } else if (position.resolution === 'CANCEL') {
        position.currentValue = position.totalInvested
      }
    } else {
      // Estimate value based on current probability
      position.currentValue =
        position.yesShares * position.currentProb +
        position.noShares * (1 - position.currentProb)
    }

    position.profitLoss = position.currentValue - position.totalInvested
    totalValue += position.currentValue
    totalProfitLoss += position.profitLoss

    positions.push(position)
  }

  // Sort by current value
  positions.sort((a, b) => b.currentValue - a.currentValue)

  return {
    success: true,
    positions,
    totalValue,
    totalProfitLoss,
  }
}

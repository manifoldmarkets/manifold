import { Router, Request, Response } from 'express'
import { authenticateRequest, APIError } from '../helpers/auth'
import { queries, getDatabase } from '../helpers/db'
import { validate, schemas } from '../helpers/validate'
import { randomId, parseJsonData, shouldIncrementUniqueBettors } from '../utils/helpers'
import {
  calculateBet,
  calculateSale,
  tradingAllowed,
  calculateProbability,
} from '../utils/cpmm'

const router = Router()

const MIN_BET = Number(process.env.MIN_BET) || 1

// POST /bet - Place a bet
router.post('/bet', async (req: Request, res: Response) => {
  try {
    const authedUser = await authenticateRequest(req)
    const input = validate(schemas.placeBet, req.body)

    // Get contract
    const contract = await queries.getContractById(input.contractId)
    if (!contract) {
      return res.status(404).json({ error: 'Market not found' })
    }

    const contractData = parseJsonData(contract)

    // Check if trading is allowed
    if (!tradingAllowed(contractData)) {
      return res.status(400).json({ error: 'Trading not allowed on this market' })
    }

    // Check minimum bet
    if (input.amount < MIN_BET) {
      return res.status(400).json({
        error: `Minimum bet is ${MIN_BET} M$`,
      })
    }

    // Get user
    const user = await queries.getUserById(authedUser.uid)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check balance
    if (user.balance < input.amount) {
      return res.status(400).json({
        error: `Insufficient balance. Need ${input.amount} M$, have ${user.balance} M$`,
      })
    }

    // Calculate bet result
    const state = {
      pool: contractData.pool,
      prob: contractData.prob,
      totalLiquidity: contractData.totalLiquidity,
    }

    const betResult = calculateBet(state, input.amount, input.outcome as 'YES' | 'NO')

    // Create bet
    const betId = randomId(12)
    const bet = {
      id: betId,
      userId: authedUser.uid,
      contractId: input.contractId,
      amount: input.amount,
      outcome: input.outcome,
      shares: betResult.shares,
      probBefore: state.prob,
      probAfter: betResult.newProb,
      isRedemption: false,
      answerId: input.answerId || null,
      fees: betResult.fees,
      createdTime: Date.now(),
    }

    // Execute bet in transaction
    const db = getDatabase()
    const created = await db.tx(async (tx) => {
      // Deduct bet amount from user
      await tx.none(
        'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1',
        [input.amount, authedUser.uid]
      )

      // Update contract
      const existingBets = await tx.any(
        'SELECT user_id FROM contract_bets WHERE contract_id = $1',
        [input.contractId]
      )

      const isNewBettor = shouldIncrementUniqueBettors(authedUser.uid, existingBets)

      await tx.none(
        `UPDATE contracts
         SET data = data || $1::jsonb,
             unique_bettor_count = unique_bettor_count + $2,
             last_bet_time = NOW()
         WHERE id = $3`,
        [
          JSON.stringify({
            pool: betResult.newPool,
            prob: betResult.newProb,
            volume: (contractData.volume || 0) + input.amount,
          }),
          isNewBettor ? 1 : 0,
          input.contractId,
        ]
      )

      // Create bet record
      const result = await tx.one(
        `INSERT INTO contract_bets (
          bet_id, user_id, contract_id, amount, outcome, shares,
          prob_before, prob_after, is_redemption, answer_id, data, created_time
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING *`,
        [
          bet.id,
          bet.userId,
          bet.contractId,
          bet.amount,
          bet.outcome,
          bet.shares,
          bet.probBefore,
          bet.probAfter,
          bet.isRedemption,
          bet.answerId,
          JSON.stringify(bet),
        ]
      )

      // Pay fees to creator
      if (betResult.fees.creatorFee > 0) {
        await tx.none(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [betResult.fees.creatorFee, contractData.creatorId]
        )
      }

      return result
    })

    res.json(parseJsonData(created))
  } catch (error: any) {
    console.error('Error placing bet:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /bets - Get bets
router.get('/bets', async (req: Request, res: Response) => {
  try {
    const { contractId, userId, limit: queryLimit } = req.query
    const limit = Math.min(Number(queryLimit) || 100, 1000)

    let bets: any[]

    if (contractId) {
      bets = await queries.getBetsByContract(contractId as string, limit)
    } else if (userId) {
      bets = await queries.getBetsByUser(userId as string, limit)
    } else {
      // Get recent bets across all contracts
      const db = getDatabase()
      bets = await db.any(
        'SELECT * FROM contract_bets ORDER BY created_time DESC LIMIT $1',
        [limit]
      )
    }

    res.json(bets.map(parseJsonData))
  } catch (error: any) {
    console.error('Error fetching bets:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /market/:contractId/sell - Sell shares
router.post(
  '/market/:contractId/sell',
  async (req: Request, res: Response) => {
    try {
      const authedUser = await authenticateRequest(req)
      const { contractId } = req.params
      const input = validate(schemas.sellShares, req.body)

      // Get contract
      const contract = await queries.getContractById(contractId)
      if (!contract) {
        return res.status(404).json({ error: 'Market not found' })
      }

      const contractData = parseJsonData(contract)

      // Check if trading is allowed
      if (!tradingAllowed(contractData)) {
        return res
          .status(400)
          .json({ error: 'Trading not allowed on this market' })
      }

      // Get user's bets to calculate shares owned
      const userBets = await queries.getBetsByUser(authedUser.uid)
      const contractBets = userBets.filter(
        (bet: any) => bet.contract_id === contractId
      )

      // Calculate total shares for outcome
      const totalShares = contractBets.reduce((sum: number, bet: any) => {
        const betData = parseJsonData(bet)
        if (betData.outcome === input.outcome) {
          return sum + betData.shares
        }
        return sum
      }, 0)

      const sharesToSell = input.shares || totalShares

      if (sharesToSell <= 0) {
        return res.status(400).json({ error: 'No shares to sell' })
      }

      if (sharesToSell > totalShares) {
        return res.status(400).json({
          error: `Insufficient shares. Have ${totalShares}, trying to sell ${sharesToSell}`,
        })
      }

      // Calculate sale
      const state = {
        pool: contractData.pool,
        prob: contractData.prob,
        totalLiquidity: contractData.totalLiquidity,
      }

      const saleResult = calculateSale(
        state,
        sharesToSell,
        input.outcome as 'YES' | 'NO'
      )

      // Create redemption bet (negative shares)
      const betId = randomId(12)
      const bet = {
        id: betId,
        userId: authedUser.uid,
        contractId,
        amount: -saleResult.saleValue, // Negative for redemption
        outcome: input.outcome,
        shares: -sharesToSell, // Negative shares
        probBefore: state.prob,
        probAfter: saleResult.newProb,
        isRedemption: true,
        answerId: null,
        fees: { creatorFee: 0, platformFee: 0, liquidityFee: 0 },
        createdTime: Date.now(),
      }

      // Execute sale in transaction
      const db = getDatabase()
      const created = await db.tx(async (tx) => {
        // Add sale proceeds to user
        await tx.none('UPDATE users SET balance = balance + $1 WHERE id = $2', [
          saleResult.saleValue,
          authedUser.uid,
        ])

        // Update contract
        await tx.none(
          `UPDATE contracts
           SET data = data || $1::jsonb
           WHERE id = $2`,
          [
            JSON.stringify({
              pool: saleResult.newPool,
              prob: saleResult.newProb,
            }),
            contractId,
          ]
        )

        // Create redemption bet record
        const result = await tx.one(
          `INSERT INTO contract_bets (
            bet_id, user_id, contract_id, amount, outcome, shares,
            prob_before, prob_after, is_redemption, data, created_time
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           RETURNING *`,
          [
            bet.id,
            bet.userId,
            bet.contractId,
            bet.amount,
            bet.outcome,
            bet.shares,
            bet.probBefore,
            bet.probAfter,
            bet.isRedemption,
            JSON.stringify(bet),
          ]
        )

        return result
      })

      res.json(parseJsonData(created))
    } catch (error: any) {
      console.error('Error selling shares:', error)

      if (error instanceof APIError) {
        return res.status(error.code).json({ error: error.message })
      }

      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

export default router

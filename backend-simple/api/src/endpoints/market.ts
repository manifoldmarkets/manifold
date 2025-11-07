import { Router, Request, Response } from 'express'
import { authenticateRequest, APIError } from '../helpers/auth'
import { queries, getDatabase } from '../helpers/db'
import { validate, schemas } from '../helpers/validate'
import {
  randomId,
  generateSlug,
  validateCloseTime,
  parseJsonData,
} from '../utils/helpers'
import { getAnte, getInitialPool, calculateProbability } from '../utils/cpmm'

const router = Router()

// POST /market - Create new market
router.post('/market', async (req: Request, res: Response) => {
  try {
    const authedUser = await authenticateRequest(req)
    const input = validate(schemas.createMarket, req.body)

    // Get user
    const user = await queries.getUserById(authedUser.uid)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Calculate ante (market creation cost)
    const ante = getAnte(input.outcomeType)

    // Check if user has enough balance
    if (user.balance < ante) {
      return res.status(400).json({
        error: `Insufficient balance. Need ${ante} M$, have ${user.balance} M$`,
      })
    }

    // Generate contract ID and slug
    const contractId = randomId(12)
    const slug = generateSlug(input.question)

    // Initial probability (50% for binary markets)
    const initialProb = 0.5
    const pool = getInitialPool(initialProb, ante)

    // Create contract
    const contract = {
      id: contractId,
      slug,
      creatorId: authedUser.uid,
      question: input.question,
      description: input.description || '',
      outcomeType: input.outcomeType,
      mechanism: 'cpmm-1',
      createdTime: Date.now(),
      closeTime: validateCloseTime(input.closeTime),
      visibility: input.visibility || 'public',
      isResolved: false,
      resolution: null,
      prob: calculateProbability(pool),
      pool,
      totalLiquidity: ante,
      subsidyPool: 0,
      volume: 0,
      uniqueBettorCount: 0,
      token: 'MANA',
    }

    // Create in database (in transaction)
    const db = getDatabase()
    const created = await db.tx(async (tx) => {
      // Deduct ante from user balance
      await tx.none('UPDATE users SET balance = balance - $1 WHERE id = $2', [
        ante,
        authedUser.uid,
      ])

      // Create contract
      const result = await tx.one(
        `INSERT INTO contracts (
          id, slug, creator_id, question, description, mechanism, outcome_type,
          close_time, resolution, data, created_time
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          contract.id,
          contract.slug,
          contract.creatorId,
          contract.question,
          contract.description,
          contract.mechanism,
          contract.outcomeType,
          contract.closeTime ? new Date(contract.closeTime) : null,
          contract.resolution,
          JSON.stringify(contract),
        ]
      )

      // Create answers if MULTIPLE_CHOICE
      if (input.outcomeType === 'MULTIPLE_CHOICE' && input.answers) {
        for (const answer of input.answers) {
          const answerId = randomId(12)
          const answerPool = getInitialPool(1 / input.answers.length, ante / input.answers.length)

          await tx.none(
            `INSERT INTO answers (id, contract_id, text, pool_yes, pool_no, prob, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              answerId,
              contractId,
              answer,
              answerPool.YES,
              answerPool.NO,
              calculateProbability(answerPool),
              JSON.stringify({ id: answerId, contractId, text: answer }),
            ]
          )
        }
      }

      return result
    })

    res.json(parseJsonData(created))
  } catch (error: any) {
    console.error('Error creating market:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /market/:id - Get market by ID
router.get('/market/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const contract = await queries.getContractById(id)

    if (!contract) {
      return res.status(404).json({ error: 'Market not found' })
    }

    res.json(parseJsonData(contract))
  } catch (error: any) {
    console.error('Error fetching market:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /slug/:slug - Get market by slug
router.get('/slug/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params
    const contract = await queries.getContractBySlug(slug)

    if (!contract) {
      return res.status(404).json({ error: 'Market not found' })
    }

    res.json(parseJsonData(contract))
  } catch (error: any) {
    console.error('Error fetching market:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /markets - List markets
router.get('/markets', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 1000)
    const offset = Number(req.query.offset) || 0
    const filter = req.query.filter || 'all' // all, open, closed, resolved

    const db = getDatabase()

    let query = 'SELECT * FROM contracts WHERE deleted = false'
    const params: any[] = []

    if (filter === 'open') {
      query += ' AND (close_time IS NULL OR close_time > NOW()) AND resolution IS NULL'
    } else if (filter === 'closed') {
      query += ' AND close_time <= NOW() AND resolution IS NULL'
    } else if (filter === 'resolved') {
      query += ' AND resolution IS NOT NULL'
    }

    query += ' ORDER BY created_time DESC LIMIT $1 OFFSET $2'
    params.push(limit, offset)

    const contracts = await db.any(query, params)

    res.json(contracts.map(parseJsonData))
  } catch (error: any) {
    console.error('Error listing markets:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /market/:contractId/resolve - Resolve market
router.post(
  '/market/:contractId/resolve',
  async (req: Request, res: Response) => {
    try {
      const authedUser = await authenticateRequest(req)
      const { contractId } = req.params
      const input = validate(schemas.resolveMarket, req.body)

      // Get contract
      const contract = await queries.getContractById(contractId)
      if (!contract) {
        return res.status(404).json({ error: 'Market not found' })
      }

      const contractData = parseJsonData(contract)

      // Check if user is creator
      if (contractData.creatorId !== authedUser.uid) {
        return res.status(403).json({ error: 'Only creator can resolve market' })
      }

      // Check if already resolved
      if (contractData.isResolved || contractData.resolution) {
        return res.status(400).json({ error: 'Market already resolved' })
      }

      // Update contract
      const db = getDatabase()
      await db.tx(async (tx) => {
        await tx.none(
          `UPDATE contracts
           SET resolution = $1,
               resolution_probability = $2,
               resolution_time = NOW(),
               data = data || $3::jsonb
           WHERE id = $4`,
          [
            input.resolution,
            input.resolutionProbability || null,
            JSON.stringify({
              resolution: input.resolution,
              resolutionTime: Date.now(),
              isResolved: true,
            }),
            contractId,
          ]
        )

        // TODO: Calculate and distribute payouts to bet winners
        // This would require iterating through all bets and calculating payouts
        // For MVP, we'll implement this in a separate endpoint
      })

      res.json({ success: true })
    } catch (error: any) {
      console.error('Error resolving market:', error)

      if (error instanceof APIError) {
        return res.status(error.code).json({ error: error.message })
      }

      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// GET /market/:contractId/answers - Get answers for multi-choice market
router.get(
  '/market/:contractId/answers',
  async (req: Request, res: Response) => {
    try {
      const { contractId } = req.params
      const db = getDatabase()

      const answers = await db.any(
        'SELECT * FROM answers WHERE contract_id = $1',
        [contractId]
      )

      res.json(answers.map(parseJsonData))
    } catch (error: any) {
      console.error('Error fetching answers:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

export default router

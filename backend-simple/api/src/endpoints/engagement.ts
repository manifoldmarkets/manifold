import { Router, Request, Response } from 'express'
import { authenticateRequest, APIError } from '../helpers/auth'
import { queries, getDatabase } from '../helpers/db'
import { validate, schemas } from '../helpers/validate'
import { randomId, parseJsonData } from '../utils/helpers'

const router = Router()

// POST /comment - Create a comment on a market
router.post('/comment', async (req: Request, res: Response) => {
  try {
    const authedUser = await authenticateRequest(req)
    const input = validate(schemas.createComment, req.body)

    // Check if contract exists
    const contract = await queries.getContractById(input.contractId)
    if (!contract) {
      return res.status(404).json({ error: 'Market not found' })
    }

    // Create comment
    const commentId = randomId(12)
    const comment = {
      id: commentId,
      contractId: input.contractId,
      userId: authedUser.uid,
      content: input.content,
      createdTime: Date.now(),
    }

    const created = await queries.createComment(comment)

    // Update contract's last_comment_time
    const db = getDatabase()
    await db.none(
      'UPDATE contracts SET last_comment_time = NOW() WHERE id = $1',
      [input.contractId]
    )

    res.json(parseJsonData(created))
  } catch (error: any) {
    console.error('Error creating comment:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /comments - Get comments for a market
router.get('/comments', async (req: Request, res: Response) => {
  try {
    const { contractId, limit: queryLimit } = req.query
    const limit = Math.min(Number(queryLimit) || 100, 500)

    if (!contractId || typeof contractId !== 'string') {
      return res.status(400).json({ error: 'contractId required' })
    }

    const comments = await queries.getCommentsByContract(contractId, limit)

    res.json(comments.map(parseJsonData))
  } catch (error: any) {
    console.error('Error fetching comments:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /txns - Get transactions
router.get('/txns', async (req: Request, res: Response) => {
  try {
    const { userId, contractId, limit: queryLimit } = req.query
    const limit = Math.min(Number(queryLimit) || 100, 500)

    const db = getDatabase()
    let txns: any[]

    if (userId) {
      txns = await queries.getTxnsByUser(userId as string, limit)
    } else if (contractId) {
      // Get transactions related to a contract
      txns = await db.any(
        `SELECT * FROM txns
         WHERE (data->>'contractId')::text = $1
         ORDER BY created_time DESC
         LIMIT $2`,
        [contractId, limit]
      )
    } else {
      // Get recent transactions
      txns = await db.any(
        'SELECT * FROM txns ORDER BY created_time DESC LIMIT $1',
        [limit]
      )
    }

    res.json(txns.map(parseJsonData))
  } catch (error: any) {
    console.error('Error fetching transactions:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /get-notifications - Get user notifications (stub for MVP)
router.get('/get-notifications', async (req: Request, res: Response) => {
  try {
    const authedUser = await authenticateRequest(req)
    const limit = Math.min(Number(req.query.limit) || 50, 200)

    // For MVP, we'll return a simple list of recent activity
    // In production, this would be a dedicated notifications table
    const db = getDatabase()

    // Get recent bets on user's markets
    const notifications = await db.any(
      `SELECT
        cb.bet_id as id,
        'bet' as type,
        cb.user_id as "fromUserId",
        c.creator_id as "toUserId",
        cb.contract_id as "contractId",
        c.question as "contractQuestion",
        cb.amount,
        cb.outcome,
        cb.created_time as "createdTime"
       FROM contract_bets cb
       JOIN contracts c ON c.id = cb.contract_id
       WHERE c.creator_id = $1
         AND cb.user_id != $1
       ORDER BY cb.created_time DESC
       LIMIT $2`,
      [authedUser.uid, limit]
    )

    res.json(notifications)
  } catch (error: any) {
    console.error('Error fetching notifications:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /react - React to content (like/unlike)
router.post('/react', async (req: Request, res: Response) => {
  try {
    const authedUser = await authenticateRequest(req)
    const { contentId, contentType, remove } = req.body

    if (!contentId || !contentType) {
      return res.status(400).json({ error: 'contentId and contentType required' })
    }

    const db = getDatabase()

    if (remove) {
      // Remove reaction
      await db.none(
        `DELETE FROM user_reactions
         WHERE user_id = $1 AND content_id = $2 AND content_type = $3`,
        [authedUser.uid, contentId, contentType]
      )
    } else {
      // Add reaction
      await db.none(
        `INSERT INTO user_reactions (user_id, content_id, content_type, created_time)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, content_id, content_type) DO NOTHING`,
        [authedUser.uid, contentId, contentType]
      )
    }

    res.json({ success: true })
  } catch (error: any) {
    console.error('Error reacting:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

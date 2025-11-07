import { Router, Request, Response } from 'express'
import { getDatabase } from '../helpers/db'
import { parseJsonData, safeParseInt } from '../utils/helpers'

const router = Router()

// GET /search-markets-full - Search markets
router.get('/search-markets-full', async (req: Request, res: Response) => {
  try {
    const { term, limit: queryLimit, sort, filter } = req.query
    const limit = Math.min(Number(queryLimit) || 20, 100)
    const sortBy = (sort as string) || 'score'
    const filterBy = (filter as string) || 'all'

    const db = getDatabase()

    let query = `
      SELECT * FROM contracts
      WHERE deleted = false
    `
    const params: any[] = []
    let paramIndex = 1

    // Add search term if provided
    if (term && typeof term === 'string' && term.length > 0) {
      query += ` AND (
        question ILIKE $${paramIndex}
        OR description ILIKE $${paramIndex}
      )`
      params.push(`%${term}%`)
      paramIndex++
    }

    // Add filter
    if (filterBy === 'open') {
      query += ' AND (close_time IS NULL OR close_time > NOW()) AND resolution IS NULL'
    } else if (filterBy === 'closed') {
      query += ' AND close_time <= NOW() AND resolution IS NULL'
    } else if (filterBy === 'resolved') {
      query += ' AND resolution IS NOT NULL'
    }

    // Add sorting
    if (sortBy === 'created-time') {
      query += ' ORDER BY created_time DESC'
    } else if (sortBy === 'volume') {
      query += ' ORDER BY (data->>\'volume\')::numeric DESC NULLS LAST'
    } else {
      // Default to score (combination of volume, unique bettors, recency)
      query += ' ORDER BY created_time DESC' // Simplified for MVP
    }

    query += ` LIMIT $${paramIndex}`
    params.push(limit)

    const contracts = await db.any(query, params)

    res.json(contracts.map(parseJsonData))
  } catch (error: any) {
    console.error('Error searching markets:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /leaderboard - Get user leaderboard
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const { kind, limit: queryLimit, token } = req.query
    const limit = Math.min(Number(queryLimit) || 100, 500)
    const leaderboardKind = (kind as string) || 'profit'

    const db = getDatabase()

    let query: string
    let params: any[] = [limit]

    if (leaderboardKind === 'creator') {
      // Creator leaderboard: users with most traders on their markets
      query = `
        SELECT
          u.id as "userId",
          u.name,
          u.username,
          u.avatar_url as "avatarUrl",
          (u.data->'creatorTraders'->'allTime')::int as score,
          COUNT(DISTINCT c.id) as "marketsCreated"
        FROM users u
        LEFT JOIN contracts c ON c.creator_id = u.id
        WHERE (u.data->'creatorTraders'->'allTime')::int > 0
        GROUP BY u.id
        ORDER BY score DESC NULLS LAST
        LIMIT $1
      `
    } else {
      // Profit leaderboard: users with highest balance
      query = `
        SELECT
          id as "userId",
          name,
          username,
          avatar_url as "avatarUrl",
          balance as score,
          total_deposits as "totalDeposits"
        FROM users
        WHERE balance > 0
        ORDER BY balance DESC
        LIMIT $1
      `
    }

    const results = await db.any(query, params)

    res.json(results)
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /balance-changes - Get user balance history
router.get('/balance-changes', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query
    const limit = Math.min(Number(req.query.limit) || 100, 500)

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId required' })
    }

    const db = getDatabase()

    // Get transactions for user
    const txns = await db.any(
      `SELECT
        id,
        created_time as "createdTime",
        from_type as "fromType",
        from_id as "fromId",
        to_type as "toType",
        to_id as "toId",
        amount,
        category,
        data
       FROM txns
       WHERE from_id = $1 OR to_id = $1
       ORDER BY created_time DESC
       LIMIT $2`,
      [userId, limit]
    )

    // Transform to balance changes
    const balanceChanges = txns.map((txn: any) => {
      const isIncoming = txn.toId === userId
      const delta = isIncoming ? txn.amount : -txn.amount

      return {
        ...parseJsonData(txn),
        delta,
      }
    })

    res.json(balanceChanges)
  } catch (error: any) {
    console.error('Error fetching balance changes:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

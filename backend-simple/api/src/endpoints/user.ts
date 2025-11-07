import { Router, Request, Response } from 'express'
import { authenticateRequest, APIError } from '../helpers/auth'
import { queries, getDatabase } from '../helpers/db'
import { validate, schemas } from '../helpers/validate'
import { randomId, humanish, parseJsonData } from '../utils/helpers'
import { giveSignupBonus } from '../utils/txn'

const router = Router()

// POST /createuser - Create new user account
router.post('/createuser', async (req: Request, res: Response) => {
  try {
    // Authenticate with Firebase
    const authedUser = await authenticateRequest(req)
    const userId = authedUser.uid

    // Validate input
    const input = validate(schemas.createUser, req.body)

    // Check if user already exists
    const existingUser = await queries.getUserById(userId)
    if (existingUser) {
      return res.status(400).json({
        error: 'User already exists',
        user: parseJsonData(existingUser),
      })
    }

    // Check if username is taken
    const existingUsername = await queries.getUserByUsername(input.username)
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' })
    }

    const STARTING_BALANCE = Number(process.env.STARTING_BALANCE) || 1000

    // Create user
    const user = {
      id: userId,
      name: input.name,
      username: input.username,
      avatarUrl: input.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
      balance: STARTING_BALANCE,
      totalDeposits: 0,
      createdTime: Date.now(),
      creatorTraders: {
        daily: 0,
        weekly: 0,
        monthly: 0,
        allTime: 0,
      },
    }

    // Validate humanish
    if (!humanish(user)) {
      return res.status(400).json({ error: 'Invalid user details' })
    }

    // Create user in database
    const created = await queries.createUser(user)

    // Give signup bonus
    await giveSignupBonus(userId)

    // Create private user record
    const db = getDatabase()
    await db.none(
      `INSERT INTO private_users (id, email, data)
       VALUES ($1, $2, $3)`,
      [userId, authedUser.creds.kind === 'jwt' ? authedUser.creds.data.email : null, JSON.stringify({})]
    )

    res.json({
      user: parseJsonData(created),
      privateUser: {
        id: userId,
        email: authedUser.creds.kind === 'jwt' ? authedUser.creds.data.email : null,
      },
    })
  } catch (error: any) {
    console.error('Error creating user:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /me - Get current user profile
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authedUser = await authenticateRequest(req)
    const user = await queries.getUserById(authedUser.uid)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json(parseJsonData(user))
  } catch (error: any) {
    console.error('Error fetching user:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /me/update - Update current user profile
router.post('/me/update', async (req: Request, res: Response) => {
  try {
    const authedUser = await authenticateRequest(req)
    const input = validate(schemas.updateUser, req.body)

    // Check if username is taken (if changing)
    if (input.username) {
      const existing = await queries.getUserByUsername(input.username)
      if (existing && existing.id !== authedUser.uid) {
        return res.status(400).json({ error: 'Username already taken' })
      }
    }

    // Update user
    const updated = await queries.updateUser(authedUser.uid, input)

    res.json(parseJsonData(updated))
  } catch (error: any) {
    console.error('Error updating user:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /me/private - Get private user data
router.get('/me/private', async (req: Request, res: Response) => {
  try {
    const authedUser = await authenticateRequest(req)
    const db = getDatabase()

    const privateUser = await db.oneOrNone(
      'SELECT * FROM private_users WHERE id = $1',
      [authedUser.uid]
    )

    if (!privateUser) {
      return res.status(404).json({ error: 'Private user not found' })
    }

    res.json(parseJsonData(privateUser))
  } catch (error: any) {
    console.error('Error fetching private user:', error)

    if (error instanceof APIError) {
      return res.status(error.code).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /user/:username - Get user by username
router.get('/user/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params
    const user = await queries.getUserByUsername(username)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json(parseJsonData(user))
  } catch (error: any) {
    console.error('Error fetching user:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /users/by-id/balance - Get user balance
router.get('/users/by-id/balance', async (req: Request, res: Response) => {
  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'User ID required' })
    }

    const user = await queries.getUserById(id)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ balance: user.balance })
  } catch (error: any) {
    console.error('Error fetching balance:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

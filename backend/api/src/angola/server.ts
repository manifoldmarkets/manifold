// ============================================================================
// ANGOLA SIMPLIFIED API SERVER
// ============================================================================
// Express server with essential endpoints for YES/NO markets
// ============================================================================

import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  ANGOLA_ROUTES,
  CreateMarketSchema,
  PlaceBetSchema,
  ResolveMarketSchema,
  SellSharesSchema,
  ListMarketsSchema,
  UserBetsSchema,
  successResponse,
  errorResponse,
  ERROR_CODES,
  getHttpStatusForError,
  generateOpenApiSpec,
} from './routes'
import {
  createMarket,
  getMarket,
  listMarkets,
  resolveMarket,
} from './handlers/market-handlers'
import {
  placeBet,
  sellShares,
  getUserBets,
  getUserPortfolio,
} from './handlers/bet-handlers'
import { getAngolaConfig } from 'common/envs/angola'

const config = getAngolaConfig()

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

const supabase = createClient(
  `https://${config.supabaseInstanceId}.supabase.co`,
  config.supabaseAnonKey
)

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express()

// Security middleware
app.use(helmet())
app.use(cors({
  origin: [
    `https://${config.domain}`,
    `https://www.${config.domain}`,
    'http://localhost:3000', // Dev
  ],
  credentials: true,
}))

// Body parsing
app.use(express.json({ limit: '10mb' }))

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
  next()
})

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

type AuthenticatedRequest = Request & {
  userId?: string
  user?: any
}

async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(
      errorResponse(ERROR_CODES.UNAUTHORIZED, 'Token de autenticacao ausente')
    )
  }

  const token = authHeader.substring(7)

  try {
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json(
        errorResponse(ERROR_CODES.INVALID_TOKEN, 'Token invalido ou expirado')
      )
    }

    // Get user from our database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (dbError || !dbUser) {
      return res.status(401).json(
        errorResponse(ERROR_CODES.USER_NOT_FOUND, 'Usuario nao encontrado')
      )
    }

    if (dbUser.is_banned) {
      return res.status(403).json(
        errorResponse(ERROR_CODES.FORBIDDEN, 'Usuario banido')
      )
    }

    req.userId = user.id
    req.user = dbUser
    next()
  } catch (err) {
    console.error('Auth error:', err)
    return res.status(401).json(
      errorResponse(ERROR_CODES.INVALID_TOKEN, 'Erro de autenticacao')
    )
  }
}

function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return next()
  }

  return authenticateUser(req, res, next)
}

// ============================================================================
// VALIDATION MIDDLEWARE
// ============================================================================

function validateBody(schema: z.ZodType<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      return res.status(400).json(
        errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Dados invalidos', {
          errors: result.error.flatten().fieldErrors,
        })
      )
    }

    req.body = result.data
    next()
  }
}

function validateQuery(schema: z.ZodType<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)

    if (!result.success) {
      return res.status(400).json(
        errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Parametros invalidos', {
          errors: result.error.flatten().fieldErrors,
        })
      )
    }

    req.query = result.data
    next()
  }
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// OpenAPI spec
app.get('/openapi.json', (req, res) => {
  res.json(generateOpenApiSpec())
})

// ============================================================================
// MARKET ROUTES
// ============================================================================

// Create market
app.post(
  '/markets',
  authenticateUser,
  validateBody(CreateMarketSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await createMarket(supabase, req.userId!, req.body)

      if (!result.success) {
        const status = getHttpStatusForError(result.error.error.code)
        return res.status(status).json(result.error)
      }

      res.status(201).json(successResponse(result.market))
    } catch (err) {
      console.error('Create market error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// List markets
app.get(
  '/markets',
  validateQuery(ListMarketsSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await listMarkets(supabase, req.query as any)

      if (!result.success) {
        const status = getHttpStatusForError(result.error.error.code)
        return res.status(status).json(result.error)
      }

      res.json(successResponse({
        markets: result.markets,
        nextCursor: result.nextCursor,
      }))
    } catch (err) {
      console.error('List markets error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// Get market by ID
app.get(
  '/markets/:id',
  async (req: Request, res: Response) => {
    try {
      const result = await getMarket(supabase, req.params.id)

      if (!result.success) {
        const status = getHttpStatusForError(result.error.error.code)
        return res.status(status).json(result.error)
      }

      res.json(successResponse(result.market))
    } catch (err) {
      console.error('Get market error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// Resolve market
app.post(
  '/markets/:id/resolve',
  authenticateUser,
  validateBody(ResolveMarketSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await resolveMarket(
        supabase,
        req.userId!,
        req.params.id,
        req.body
      )

      if (!result.success) {
        const status = getHttpStatusForError(result.error.error.code)
        return res.status(status).json(result.error)
      }

      res.json(successResponse({
        market: result.market,
        payoutsCount: result.payoutsCount,
        totalPayout: result.totalPayout,
      }))
    } catch (err) {
      console.error('Resolve market error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// ============================================================================
// BETTING ROUTES
// ============================================================================

// Place bet
app.post(
  '/bets',
  authenticateUser,
  validateBody(PlaceBetSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await placeBet(supabase, req.userId!, req.body)

      if (!result.success) {
        const status = getHttpStatusForError(result.error.error.code)
        return res.status(status).json(result.error)
      }

      res.status(201).json(successResponse({
        bet: result.bet,
        newBalance: result.newBalance,
      }))
    } catch (err) {
      console.error('Place bet error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// Sell shares
app.post(
  '/sell',
  authenticateUser,
  validateBody(SellSharesSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await sellShares(supabase, req.userId!, req.body)

      if (!result.success) {
        const status = getHttpStatusForError(result.error.error.code)
        return res.status(status).json(result.error)
      }

      res.json(successResponse({
        bet: result.bet,
        newBalance: result.newBalance,
        sharesSold: result.sharesSold,
      }))
    } catch (err) {
      console.error('Sell shares error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// ============================================================================
// USER ROUTES
// ============================================================================

// Get current user
app.get(
  '/user/me',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(successResponse(req.user))
  }
)

// Get user portfolio
app.get(
  '/user/portfolio',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await getUserPortfolio(supabase, req.userId!)

      if (!result.success) {
        const status = getHttpStatusForError(result.error.error.code)
        return res.status(status).json(result.error)
      }

      res.json(successResponse({
        positions: result.positions,
        totalValue: result.totalValue,
        totalProfitLoss: result.totalProfitLoss,
      }))
    } catch (err) {
      console.error('Get portfolio error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// Get user bets
app.get(
  '/user/bets',
  authenticateUser,
  validateQuery(UserBetsSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await getUserBets(supabase, req.userId!, req.query as any)

      if (!result.success) {
        const status = getHttpStatusForError(result.error.error.code)
        return res.status(status).json(result.error)
      }

      res.json(successResponse({
        bets: result.bets,
        nextCursor: result.nextCursor,
      }))
    } catch (err) {
      console.error('Get user bets error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// Update user profile
app.put(
  '/user/profile',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allowedFields = ['name', 'bio', 'avatar_url']
      const updates: Record<string, any> = {}

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field]
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json(
          errorResponse(ERROR_CODES.INVALID_INPUT, 'Nenhum campo para atualizar')
        )
      }

      updates.updated_at = new Date().toISOString()

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', req.userId!)
        .select()
        .single()

      if (error) {
        return res.status(500).json(
          errorResponse(ERROR_CODES.DATABASE_ERROR, 'Erro ao atualizar perfil')
        )
      }

      res.json(successResponse(data))
    } catch (err) {
      console.error('Update profile error:', err)
      res.status(500).json(
        errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
      )
    }
  }
)

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json(
    errorResponse(ERROR_CODES.NOT_FOUND, 'Endpoint nao encontrado')
  )
})

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json(
    errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor')
  )
})

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 8080

export function startServer() {
  app.listen(PORT, () => {
    console.log(`Angola API server running on port ${PORT}`)
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`Domain: ${config.domain}`)
  })
}

export default app

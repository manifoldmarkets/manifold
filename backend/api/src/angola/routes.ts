// ============================================================================
// ANGOLA SIMPLIFIED API ROUTES
// ============================================================================
// Essential endpoints only for YES/NO binary markets
// Endpoints:
//   POST /markets - criar mercado YES/NO
//   POST /bets - fazer aposta
//   GET /markets - listar mercados
//   GET /markets/:id - detalhes do mercado
//   POST /markets/:id/resolve - resolver mercado
//   GET /user/portfolio - portfolio do usuario
//   GET /user/bets - historico de apostas
//   POST /sell - vender shares
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'

// ============================================================================
// REQUEST SCHEMAS (Validation)
// ============================================================================

// Create Market
export const CreateMarketSchema = z.object({
  question: z
    .string()
    .min(10, 'Pergunta deve ter pelo menos 10 caracteres')
    .max(200, 'Pergunta deve ter no maximo 200 caracteres'),
  description: z.string().optional(),
  initialProbability: z
    .number()
    .min(0.01, 'Probabilidade minima: 1%')
    .max(0.99, 'Probabilidade maxima: 99%')
    .default(0.5),
  closeTime: z.number().optional(), // Unix timestamp
  visibility: z.enum(['public', 'unlisted']).default('public'),
  initialLiquidity: z.number().min(1000).default(5000), // In AOA
})

// Place Bet
export const PlaceBetSchema = z.object({
  marketId: z.string().uuid(),
  outcome: z.enum(['YES', 'NO']),
  amount: z.number().min(100, 'Aposta minima: Kz 100'), // In AOA
  limitProb: z.number().min(0.01).max(0.99).optional(),
})

// Resolve Market
export const ResolveMarketSchema = z.object({
  resolution: z.enum(['YES', 'NO', 'MKT', 'CANCEL']),
  resolutionProbability: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
})

// Sell Shares
export const SellSharesSchema = z.object({
  marketId: z.string().uuid(),
  outcome: z.enum(['YES', 'NO']),
  shares: z.number().positive().optional(), // If not specified, sell all
})

// List Markets Query
export const ListMarketsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum(['open', 'closed', 'resolved', 'all']).default('open'),
  sort: z
    .enum(['newest', 'volume', 'popularity', 'closing-soon'])
    .default('newest'),
  creatorId: z.string().uuid().optional(),
  search: z.string().optional(),
})

// User Bets Query
export const UserBetsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  marketId: z.string().uuid().optional(),
})

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

export type AngolaRoute = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  schema?: z.ZodType<any>
  auth: 'required' | 'optional' | 'none'
  handler: string // Handler function name
  description: string
}

export const ANGOLA_ROUTES: AngolaRoute[] = [
  // Markets
  {
    method: 'POST',
    path: '/markets',
    schema: CreateMarketSchema,
    auth: 'required',
    handler: 'createMarket',
    description: 'Criar novo mercado YES/NO',
  },
  {
    method: 'GET',
    path: '/markets',
    schema: ListMarketsSchema,
    auth: 'none',
    handler: 'listMarkets',
    description: 'Listar mercados',
  },
  {
    method: 'GET',
    path: '/markets/:id',
    auth: 'none',
    handler: 'getMarket',
    description: 'Obter detalhes do mercado',
  },
  {
    method: 'POST',
    path: '/markets/:id/resolve',
    schema: ResolveMarketSchema,
    auth: 'required',
    handler: 'resolveMarket',
    description: 'Resolver mercado (apenas criador ou admin)',
  },

  // Betting
  {
    method: 'POST',
    path: '/bets',
    schema: PlaceBetSchema,
    auth: 'required',
    handler: 'placeBet',
    description: 'Fazer aposta',
  },
  {
    method: 'POST',
    path: '/sell',
    schema: SellSharesSchema,
    auth: 'required',
    handler: 'sellShares',
    description: 'Vender shares',
  },

  // User
  {
    method: 'GET',
    path: '/user/portfolio',
    auth: 'required',
    handler: 'getUserPortfolio',
    description: 'Obter portfolio do usuario',
  },
  {
    method: 'GET',
    path: '/user/bets',
    schema: UserBetsSchema,
    auth: 'required',
    handler: 'getUserBets',
    description: 'Historico de apostas do usuario',
  },
  {
    method: 'GET',
    path: '/user/me',
    auth: 'required',
    handler: 'getCurrentUser',
    description: 'Obter dados do usuario atual',
  },
  {
    method: 'PUT',
    path: '/user/profile',
    auth: 'required',
    handler: 'updateUserProfile',
    description: 'Atualizar perfil do usuario',
  },

  // Auth (if not using Supabase Auth directly)
  {
    method: 'POST',
    path: '/auth/phone/request-otp',
    auth: 'none',
    handler: 'requestPhoneOtp',
    description: 'Solicitar codigo OTP por telefone',
  },
  {
    method: 'POST',
    path: '/auth/phone/verify',
    auth: 'none',
    handler: 'verifyPhoneOtp',
    description: 'Verificar codigo OTP',
  },
]

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export type ApiResponse<T> = {
  success: true
  data: T
}

export type ApiErrorResponse = {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, any>
  }
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  MARKET_NOT_FOUND: 'MARKET_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // Business Logic
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  MARKET_CLOSED: 'MARKET_CLOSED',
  MARKET_RESOLVED: 'MARKET_RESOLVED',
  INVALID_RESOLUTION: 'INVALID_RESOLUTION',
  CANNOT_BET_OWN_MARKET: 'CANNOT_BET_OWN_MARKET',
  MIN_BET_AMOUNT: 'MIN_BET_AMOUNT',
  NO_SHARES_TO_SELL: 'NO_SHARES_TO_SELL',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function successResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data }
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, any>
): ApiErrorResponse {
  return {
    success: false,
    error: { code, message, details },
  }
}

export function getHttpStatusForError(code: ErrorCode): number {
  switch (code) {
    case ERROR_CODES.UNAUTHORIZED:
    case ERROR_CODES.INVALID_TOKEN:
      return 401
    case ERROR_CODES.FORBIDDEN:
      return 403
    case ERROR_CODES.NOT_FOUND:
    case ERROR_CODES.MARKET_NOT_FOUND:
    case ERROR_CODES.USER_NOT_FOUND:
      return 404
    case ERROR_CODES.VALIDATION_ERROR:
    case ERROR_CODES.INVALID_INPUT:
    case ERROR_CODES.INSUFFICIENT_BALANCE:
    case ERROR_CODES.MARKET_CLOSED:
    case ERROR_CODES.MARKET_RESOLVED:
    case ERROR_CODES.INVALID_RESOLUTION:
    case ERROR_CODES.MIN_BET_AMOUNT:
    case ERROR_CODES.NO_SHARES_TO_SELL:
      return 400
    case ERROR_CODES.INTERNAL_ERROR:
    case ERROR_CODES.DATABASE_ERROR:
    default:
      return 500
  }
}

// ============================================================================
// OPENAPI DOCUMENTATION
// ============================================================================

export const API_INFO = {
  title: 'Mercado de Previsoes Angola API',
  version: '1.0.0',
  description: 'API simplificada para mercados de previsao YES/NO em Angola',
  contact: {
    name: 'Suporte',
    email: 'suporte@mercado.ao',
  },
}

export const generateOpenApiSpec = () => {
  const paths: Record<string, any> = {}

  for (const route of ANGOLA_ROUTES) {
    const pathKey = route.path.replace(/:(\w+)/g, '{$1}')

    if (!paths[pathKey]) {
      paths[pathKey] = {}
    }

    paths[pathKey][route.method.toLowerCase()] = {
      summary: route.description,
      security: route.auth === 'required' ? [{ bearerAuth: [] }] : [],
      responses: {
        '200': {
          description: 'Sucesso',
        },
        '400': {
          description: 'Erro de validacao',
        },
        '401': {
          description: 'Nao autorizado',
        },
        '500': {
          description: 'Erro interno',
        },
      },
    }
  }

  return {
    openapi: '3.0.0',
    info: API_INFO,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  }
}

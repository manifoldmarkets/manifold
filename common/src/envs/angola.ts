// ============================================================================
// ANGOLA ENVIRONMENT CONFIGURATION
// ============================================================================
// Simplified configuration for Angolan prediction market
// Uses Supabase Auth exclusively (no Firebase)
// Currency: AOA (Angolan Kwanza)
// ============================================================================

export type AngolaEnvConfig = {
  domain: string
  supabaseInstanceId: string
  supabaseAnonKey: string
  apiEndpoint: string
  googleAnalyticsId?: string

  // Access controls
  adminIds: string[]
  visibility: 'PRIVATE' | 'PUBLIC'

  // Branding
  currencySymbol: string // 'Kz' for Kwanza
  currencyCode: string // 'AOA'
  currencyName: string // 'Kwanza'
  bettor: string
  nounBet: string
  verbPastBet: string
  faviconPath: string
  siteName: string
  siteDescription: string

  // Auth providers enabled
  authProviders: {
    google: boolean
    phone: boolean
  }

  // Minimum amounts (in AOA)
  minBetAmount: number
  minMarketCreationAmount: number
  minDeposit: number
  minWithdrawal: number

  // Platform fees (percentage)
  platformFeePercent: number
  creatorFeePercent: number
}

export const ANGOLA_CONFIG: AngolaEnvConfig = {
  // Domain - to be configured for production
  domain: 'mercado.ao', // Example domain for Angola

  // Supabase Configuration - MUST BE UPDATED FOR PRODUCTION
  supabaseInstanceId: 'YOUR_SUPABASE_INSTANCE_ID',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',

  // API Endpoint
  apiEndpoint: 'api.mercado.ao',

  // Analytics - optional
  googleAnalyticsId: undefined,

  // Admin Users - MUST BE UPDATED FOR PRODUCTION
  adminIds: [
    // Add admin user IDs here
  ],

  visibility: 'PUBLIC',

  // Currency Configuration - Angolan Kwanza
  currencySymbol: 'Kz',
  currencyCode: 'AOA',
  currencyName: 'Kwanza',

  // Terminology
  bettor: 'apostador',
  nounBet: 'aposta',
  verbPastBet: 'apostou',

  // Branding
  faviconPath: '/favicon.ico',
  siteName: 'Mercado de Previsoes Angola',
  siteDescription: 'Plataforma de mercados de previsao em Angola',

  // Authentication Providers
  authProviders: {
    google: true,
    phone: true, // Phone auth enabled for Angola market
  },

  // Minimum Amounts (in AOA)
  minBetAmount: 100, // Minimum 100 Kz per bet
  minMarketCreationAmount: 5000, // 5000 Kz to create market
  minDeposit: 500, // Minimum deposit
  minWithdrawal: 1000, // Minimum withdrawal

  // Platform Fees
  platformFeePercent: 2.0, // 2% platform fee
  creatorFeePercent: 1.0, // 1% goes to market creator
}

// Environment variable override support
export function getAngolaConfig(): AngolaEnvConfig {
  const config = { ...ANGOLA_CONFIG }

  // Allow environment variable overrides
  if (process.env.NEXT_PUBLIC_SUPABASE_INSTANCE_ID) {
    config.supabaseInstanceId = process.env.NEXT_PUBLIC_SUPABASE_INSTANCE_ID
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    config.supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }
  if (process.env.NEXT_PUBLIC_API_ENDPOINT) {
    config.apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT
  }
  if (process.env.NEXT_PUBLIC_DOMAIN) {
    config.domain = process.env.NEXT_PUBLIC_DOMAIN
  }

  return config
}

// Currency formatting utilities
export function formatAOA(amount: number): string {
  return `${ANGOLA_CONFIG.currencySymbol} ${amount.toLocaleString('pt-AO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatAOACompact(amount: number): string {
  if (amount >= 1000000) {
    return `${ANGOLA_CONFIG.currencySymbol} ${(amount / 1000000).toFixed(1)}M`
  }
  if (amount >= 1000) {
    return `${ANGOLA_CONFIG.currencySymbol} ${(amount / 1000).toFixed(1)}K`
  }
  return formatAOA(amount)
}

// Validate amount meets minimum requirements
export function validateBetAmount(amount: number): {
  valid: boolean
  error?: string
} {
  if (amount < ANGOLA_CONFIG.minBetAmount) {
    return {
      valid: false,
      error: `Aposta minima: ${formatAOA(ANGOLA_CONFIG.minBetAmount)}`,
    }
  }
  return { valid: true }
}

export function validateMarketCreationAmount(amount: number): {
  valid: boolean
  error?: string
} {
  if (amount < ANGOLA_CONFIG.minMarketCreationAmount) {
    return {
      valid: false,
      error: `Valor minimo para criar mercado: ${formatAOA(ANGOLA_CONFIG.minMarketCreationAmount)}`,
    }
  }
  return { valid: true }
}

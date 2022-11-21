export const SUPABASE_TABLES = [
  'txns',
  'groups',
  'users',
  'contracts',
  'bets',
  'comments',
] as const

export type SupabaseTable = typeof SUPABASE_TABLES[number]

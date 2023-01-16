import { Database } from './supabase/schema'

export type DocumentKind =
  | 'user'
  | 'userFollow'
  | 'userReaction'
  | 'userEvent'
  | 'userSeenMarket'
  | 'contract'
  | 'contractAnswer'
  | 'contractBet'
  | 'contractComment'
  | 'contractFollow'
  | 'contractLiquidity'
  | 'group'
  | 'groupContract'
  | 'groupMember'
  | 'txn'
  | 'manalink'
  | 'post'
  | 'test'
  | 'userPortfolioHistory'
  | 'userContractMetrics'

export type WriteKind = 'create' | 'update' | 'delete'

export type WriteDocument = { [k: string]: any }

export type TLEntry<T extends WriteDocument = WriteDocument> = {
  eventId: string
  tableId: keyof Database['public']['Tables']
  docKind: DocumentKind
  writeKind: WriteKind
  docId: string
  parentId: string | null
  path: string
  data: T | null
  ts: number
}

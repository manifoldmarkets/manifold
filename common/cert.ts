import { JSONContent } from '@tiptap/core'
import { Txn } from './txn'

// Represents an impact certificate
export type Cert = {
  id: string
  slug: string // auto-generated; must be unique

  creatorId: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl: string

  title: string
  description: string | JSONContent

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime?: number // Updated on new bet or comment

  // For a first-pass, we'll create 10k shares
  // And track all ownership on this
  // txns: Txn[]
}

// Actions necessary on a cert:
// - Create
// - Buy and sell shares
// - Pay out dividends to shareholders

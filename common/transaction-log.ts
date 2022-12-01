export type DocumentKind =
  | 'txn'
  | 'group'
  | 'user'
  | 'contract'
  | 'contractBet'
  | 'contractComment'

export type WriteKind = 'create' | 'update' | 'delete'

export type WriteDocument = { [k: string]: any }

export type TLEntry<T extends WriteDocument = WriteDocument> = {
  eventId: string
  docKind: DocumentKind
  writeKind: WriteKind
  docId: string
  parent: string
  data: T | null
  ts: number
}

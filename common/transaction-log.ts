export type DocumentKind =
  | 'user'
  | 'userFollower'
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

export type WriteKind = 'create' | 'update' | 'delete'

export type WriteDocument = { [k: string]: any }

export type TLEntry<T extends WriteDocument = WriteDocument> = {
  eventId: string
  docKind: DocumentKind
  writeKind: WriteKind
  docId: string
  parentId: string | null
  path: string
  data: T | null
  ts: number
}

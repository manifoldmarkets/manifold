export type Like = {
  id: string // will be id of the object liked, i.e. contract.id
  userId: string
  type: 'contract'
  createdTime: number
  tipTxnId?: string
}

export type PushTicket = {
  status: 'ok' | 'error'
  id: string
  createdTime: number
  receiptStatus: 'not-checked' | 'ok' | 'error'
  receiptError?: string
}

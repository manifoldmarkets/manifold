export type PushTicket = {
  status: 'ok' | 'error'
  userId: string
  notificationId: string
  id: string
  createdTime: number
  receiptStatus: 'not-checked' | 'ok' | 'error'
  receiptError?: string
}

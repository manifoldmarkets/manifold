import type { PerpDirection, PerpEventType } from './position'

export type PerpTradeActivityType = Extract<
  PerpEventType,
  'open' | 'add' | 'close'
>

/**
 * A user-initiated PERP trade shown in discovery activity feeds.
 *
 * This intentionally excludes the full accounting event payload so automated
 * funding, liquidation, ADL, and settlement events cannot masquerade as bets.
 */
export type PerpTradeActivity = {
  id: string
  contractId: string
  userId: string
  eventType: PerpTradeActivityType
  createdTime: number
  direction: PerpDirection
  /** Absolute original margin added or removed by this action. */
  margin: number
  /** Position leverage after an open/add. Close events normally report zero. */
  leverage: number | null
}

export type View = {
  contractId: string
  timestamp: number
}

export type UserEvent = ClickEvent

export type ClickEvent = {
  type: 'click'
  contractId: string
  timestamp: number
}

export type LatencyEvent = {
  type: 'feed' | 'portfolio'
  latency: number
  timestamp: number
}

export type UserEvent = {
  name: string
  timestamp: number
}

export type ContractCardView = {
  slug: string
  contractId: string
  creatorId: string
  // Following attributes added by saveUserEvent
  name: 'view market card' // Name is the event name
  timestamp: number
}

export type ContractView = {
  slug: string
  contractId: string
  creatorId: string
  // Following attributes added by saveUserEvent
  name: 'view market'
  timestamp: number
}

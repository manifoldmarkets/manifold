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

export type ShareEvent = {
  type: 'copy sharing link'
  url: string
  timestamp: number
  name: ShareEventName
}

const ShareEventNames = [
  'copy market link',
  'copy creator market link',
  'copy dream link',
  'copy group link',
  'copy manalink',
  'copy ad link',
  'copy post link',
  'copy referral link',
  'copy weekly profit link',
  'copy twitch link',
  'copy styles link',
  'copy comment link',
] as const

export type ShareEventName = typeof ShareEventNames[number]

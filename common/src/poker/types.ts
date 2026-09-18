export const POKER_MINIMUM_MULTIPLIER = 100
export const POKER_MAX_SEATS = 9
export const POKER_ROUND_MS = 30_000
export const POKER_COUNTDOWN_MS = 5_000
export const POKER_RESULTS_MS = 8_000
export const POKER_STREETS = ['Pre-flop', 'Flop', 'Turn', 'River'] as const
export type PokerMove = 'rock' | 'paper' | 'scissors'
// 0..51: rank = card % 13 + 2, suit = floor(card / 13).
export type PokerCard = number
export type PokerPlayer = {
  userId: string
  name: string
  avatarUrl?: string
  seat: number
  sessionId: string
  cards: PokerCard[]
  contributed: number
  folded: boolean
  allIn: boolean
}
export type PokerRound = {
  street: number
  startingPot: number
  raise: number
  rocks: number
  moves: {
    userId: string
    move: PokerMove
    downgraded: boolean
    timedOut: boolean
    paid: number
  }[]
}
export type PokerPot = {
  amount: number
  eligible: string[]
  winners?: string[]
}
export type PokerSettlement = {
  pots: PokerPot[]
  refunds: Record<string, number>
  payouts: Record<string, number>
  showdown: boolean
}
// Server-only state. Never return this object from an API or websocket.
export type PokerHand = {
  id: string
  number: number
  dealer: number
  street: number
  deadline: number
  deck: PokerCard[]
  board: PokerCard[]
  players: PokerPlayer[]
  moves: Record<string, PokerMove>
  rounds: PokerRound[]
  settlement?: PokerSettlement
}
export type PokerSeat = {
  userId: string
  name: string
  avatarUrl?: string
  seat: number
  ready: boolean
  leaving: boolean
  needsMinimum: boolean
  sessionProfit: number
}
export type PokerHandView = Omit<PokerHand, 'deck' | 'players' | 'moves'> & {
  players: (Omit<PokerPlayer, 'sessionId' | 'cards'> & {
    cards?: PokerCard[]
    locked: boolean
  })[]
  yourMove?: PokerMove
  pots: PokerPot[]
}
export type PokerTableSummary = {
  id: string
  name: string
  // Permanent public rooms have no player host.
  creatorId: string | null
  visibility: 'public' | 'private'
  ante: number
  minimumBalance: number
  seats: number
  started: boolean
  status: 'waiting' | 'countdown' | 'playing' | 'results' | 'closed' | 'paused'
}
export type PokerChatMessage = {
  username: string
  id: number
  userId: string
  name: string
  avatarUrl?: string
  text: string
  createdTime: number
}
export type PokerTableView = {
  table: PokerTableSummary
  version: number
  serverTime: number
  nextDealAt: number | null
  closing: boolean
  newHandsEnabled: boolean
  seats: PokerSeat[]
  hand: PokerHandView | null
  history: PokerHandView[]
  messages: PokerChatMessage[]
  moderation: {
    userId: string
    name: string
    muted: boolean
    banned: boolean
  }[]
  viewer: {
    balance: number | null
    canEnter: boolean
    canRock: boolean
    rockRequirement: number
    maximumCall: number
    muted: boolean
    banned: boolean
  }
}
export type PokerAction =
  | { type: 'join' | 'leave' | 'start' | 'close' }
  | { type: 'ready'; ready: boolean }
  | { type: 'move'; handId: string; street: number; move: PokerMove }
  | { type: 'chat'; text: string }
  | { type: 'mute' | 'ban'; userId: string; enabled: boolean }

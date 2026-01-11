// Charity Giveaway types

export interface CharityGiveaway {
  giveawayNum: number
  name: string
  prizeAmountUsd: number
  closeTime: number
  winningTicketId: string | null
  createdTime: number
}

export interface CharityGiveawayTicket {
  id: string
  giveawayNum: number
  charityId: string
  userId: string
  numTickets: number
  manaSpent: number
  createdTime: number
}

export interface CharityGiveawayStats {
  charityId: string
  totalTickets: number
  totalManaSpent: number
}

// Bonding curve constants
export const GIVEAWAY_BASE_PRICE = 0.1 // 0.10 mana per ticket to start
export const GIVEAWAY_SCALE_FACTOR = 1000000 // Price doubles at 1,000,000 tickets

// Calculate the cost to buy numTickets starting from currentTickets
export function calculateGiveawayTicketCost(
  currentTickets: number,
  numTickets: number
): number {
  const n1 = currentTickets
  const n2 = currentTickets + numTickets
  return (
    GIVEAWAY_BASE_PRICE *
    (n2 - n1 + (n2 * n2 - n1 * n1) / (2 * GIVEAWAY_SCALE_FACTOR))
  )
}

// Get current price per ticket (for display)
export function getCurrentGiveawayTicketPrice(currentTickets: number): number {
  return GIVEAWAY_BASE_PRICE * (1 + currentTickets / GIVEAWAY_SCALE_FACTOR)
}

// Calculate how many tickets you can buy with a given amount of mana
// Uses quadratic formula to invert the cost function
export function calculateTicketsFromMana(
  currentTickets: number,
  mana: number
): number {
  if (mana <= 0) return 0

  const S = GIVEAWAY_SCALE_FACTOR
  const B = GIVEAWAY_BASE_PRICE
  const n = currentTickets

  // Solving: B * t + B * (2*n*t + t²) / (2*S) = mana
  // Rearranged to: t² + 2*(S+n)*t - 2*S*mana/B = 0
  // Using quadratic formula: t = -(S+n) + sqrt((S+n)² + 2*S*mana/B)
  const discriminant = (S + n) * (S + n) + (2 * S * mana) / B
  const tickets = -(S + n) + Math.sqrt(discriminant)

  return Math.max(0, tickets)
}

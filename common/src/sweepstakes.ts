// Sweepstakes types and utility functions

export interface Sweepstakes {
  sweepstakesNum: number
  name: string
  prizes: SweepstakesPrize[]
  closeTime: number
  winningTicketIds: string[] | null
  createdTime: number
}

export interface SweepstakesPrize {
  // For single rank prizes (1st, 2nd, 3rd)
  rank?: number
  // For range prizes (4th-10th)
  rankStart?: number
  rankEnd?: number
  amountUsdc: number
  label: string // "1st", "2nd", "4th-10th", etc.
}

export interface SweepstakesTicket {
  id: string
  sweepstakesNum: number
  userId: string
  numTickets: number
  manaSpent: number
  isFree: boolean
  createdTime: number
}

export interface SweepstakesUserStats {
  userId: string
  totalTickets: number
  totalManaSpent: number
}

export interface SweepstakesWinner {
  rank: number
  label: string
  prizeUsdc: number
  ticketId: string
  user: {
    id: string
    username: string
    name: string
    avatarUrl: string
  }
}

// Bonding curve constants (same as charity giveaway)
export const SWEEPSTAKES_BASE_PRICE = 0.1 // 0.10 mana per ticket to start
export const SWEEPSTAKES_SCALE_FACTOR = 1000000 // Price doubles at 1,000,000 tickets

// Calculate the cost to buy numTickets starting from currentTickets
export function calculateSweepstakesTicketCost(
  currentTickets: number,
  numTickets: number
): number {
  const n1 = currentTickets
  const n2 = currentTickets + numTickets
  return (
    SWEEPSTAKES_BASE_PRICE *
    (n2 - n1 + (n2 * n2 - n1 * n1) / (2 * SWEEPSTAKES_SCALE_FACTOR))
  )
}

// Get current price per ticket (for display)
export function getCurrentSweepstakesTicketPrice(
  currentTickets: number
): number {
  return SWEEPSTAKES_BASE_PRICE * (1 + currentTickets / SWEEPSTAKES_SCALE_FACTOR)
}

// Calculate how many tickets you can buy with a given amount of mana
// Uses quadratic formula to invert the cost function
export function calculateSweepstakesTicketsFromMana(
  currentTickets: number,
  mana: number
): number {
  if (mana <= 0) return 0

  const S = SWEEPSTAKES_SCALE_FACTOR
  const B = SWEEPSTAKES_BASE_PRICE
  const n = currentTickets

  // Solving: B * t + B * (2*n*t + t²) / (2*S) = mana
  // Rearranged to: t² + 2*(S+n)*t - 2*S*mana/B = 0
  // Using quadratic formula: t = -(S+n) + sqrt((S+n)² + 2*S*mana/B)
  const discriminant = (S + n) * (S + n) + (2 * S * mana) / B
  const tickets = -(S + n) + Math.sqrt(discriminant)

  return Math.max(0, tickets)
}

// Calculate total number of winners from prizes configuration
export function getTotalWinnerCount(prizes: SweepstakesPrize[]): number {
  let count = 0
  for (const prize of prizes) {
    if (prize.rank !== undefined) {
      count += 1
    } else if (prize.rankStart !== undefined && prize.rankEnd !== undefined) {
      count += prize.rankEnd - prize.rankStart + 1
    }
  }
  return count
}

// Get prize for a specific rank
export function getPrizeForRank(
  prizes: SweepstakesPrize[],
  rank: number
): SweepstakesPrize | undefined {
  for (const prize of prizes) {
    if (prize.rank === rank) {
      return prize
    }
    if (
      prize.rankStart !== undefined &&
      prize.rankEnd !== undefined &&
      rank >= prize.rankStart &&
      rank <= prize.rankEnd
    ) {
      return prize
    }
  }
  return undefined
}

// Calculate total prize pool
export function getTotalPrizePool(prizes: SweepstakesPrize[]): number {
  let total = 0
  for (const prize of prizes) {
    if (prize.rank !== undefined) {
      total += prize.amountUsdc
    } else if (prize.rankStart !== undefined && prize.rankEnd !== undefined) {
      const count = prize.rankEnd - prize.rankStart + 1
      total += prize.amountUsdc * count
    }
  }
  return total
}

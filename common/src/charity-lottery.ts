// Charity Lottery types

export interface CharityLottery {
  lotteryNum: number
  name: string
  prizeAmountUsd: number
  closeTime: number
  winningTicketId: string | null
  createdTime: number
}

export interface CharityLotteryTicket {
  id: string
  lotteryNum: number
  charityId: string
  userId: string
  numTickets: number
  manaSpent: number
  createdTime: number
}

export interface CharityLotteryStats {
  charityId: string
  totalTickets: number
  totalManaSpent: number
}

// Bonding curve constants
export const LOTTERY_BASE_PRICE = 0.1 // 0.10 mana per ticket to start
export const LOTTERY_SCALE_FACTOR = 500000 // Price doubles at 500,000 tickets

// Calculate the cost to buy numTickets starting from currentTickets
export function calculateLotteryTicketCost(
  currentTickets: number,
  numTickets: number
): number {
  const n1 = currentTickets
  const n2 = currentTickets + numTickets
  return (
    LOTTERY_BASE_PRICE *
    (n2 - n1 + (n2 * n2 - n1 * n1) / (2 * LOTTERY_SCALE_FACTOR))
  )
}

// Get current price per ticket (for display)
export function getCurrentLotteryTicketPrice(currentTickets: number): number {
  return LOTTERY_BASE_PRICE * (1 + currentTickets / LOTTERY_SCALE_FACTOR)
}

export const FIXED_ANTE = 50
const ANTES = {
  BINARY: FIXED_ANTE,
  MULTIPLE_CHOICE: FIXED_ANTE / 2, // Amount per answer.
  FREE_RESPONSE: FIXED_ANTE * 2,
  PSEUDO_NUMERIC: FIXED_ANTE * 5,
  NUMERIC: FIXED_ANTE * 5,
  CERT: FIXED_ANTE * 10,
  QUADRATIC_FUNDING: FIXED_ANTE * 10,
  STONK: FIXED_ANTE,
}

export const getAnte = (
  outcomeType: string,
  numAnswers: number | undefined,
  isPrivate: boolean
) => {
  const ante = ANTES[outcomeType as keyof typeof ANTES] ?? FIXED_ANTE
  const privateFee = isPrivate ? 200 : 0

  return (
    privateFee +
    (outcomeType === 'MULTIPLE_CHOICE' && numAnswers ? ante * numAnswers : ante)
  )
}

export const STARTING_BALANCE = 500
export const STARTING_BONUS = 500
// for sus users, i.e. multiple sign ups for same person
export const SUS_STARTING_BALANCE = 10

export const REFERRAL_AMOUNT = 250

export const UNIQUE_BETTOR_BONUS_AMOUNT = 5
export const UNIQUE_BETTOR_LIQUIDITY = 20
export const MAX_TRADERS_FOR_BONUS = 100

export const BETTING_STREAK_BONUS_AMOUNT = 5
export const BETTING_STREAK_BONUS_MAX = 25
export const BETTING_STREAK_RESET_HOUR = 7

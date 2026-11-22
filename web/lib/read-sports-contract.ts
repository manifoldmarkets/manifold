import { db } from 'web/lib/supabase/db'
import { getContract, getAnswersForContracts } from 'common/supabase/contracts'
import { isMultiCpmm, type CPMMMultiContract } from 'common/contract'
import { sportsViewNow } from 'common/sports-view-clock'
import { matchesSportsTicket } from 'common/sports-official-game'
import {
  verifiedUfcTicket,
  ufcTicketBinding,
  type UfcMarketBout,
} from 'common/bdl/ufc-card'
import type { ScheduleGame } from 'common/sports-schedule'

/** Answers live in their own table. Bracket that read with two fixture checks;
 * the order endpoint repeats the check under the platform's contract lock. */
export async function readSportsContract(
  contractId: string,
  expected?: ScheduleGame | UfcMarketBout
) {
  const first = await getContract(db, contractId)
  if (!first || !isMultiCpmm(first)) return null
  const answers = (await getAnswersForContracts(db, [contractId]))[contractId]
  if (!expected) {
    const legacy = first as CPMMMultiContract
    return { ...legacy, answers: answers ?? legacy.answers ?? [] }
  }
  const latest = await getContract(db, contractId)
  const rows = answers ?? []
  if (
    !latest ||
    !isMultiCpmm(latest) ||
    latest.outcomeType !== 'MULTIPLE_CHOICE' ||
    ![first, latest].every((c) =>
      'observedEventId' in expected
        ? !!verifiedUfcTicket(
            {
              binding: ufcTicketBinding(expected),
              closeTime: expected.closeTime ?? 0,
            },
            c,
            rows,
            sportsViewNow()
          )
        : matchesSportsTicket(expected, c, rows, sportsViewNow())
    )
  )
    return null
  return {
    ...latest,
    closeTime: Math.min(
      first.closeTime ?? Infinity,
      latest.closeTime ?? Infinity
    ),
    answers: rows,
  }
}

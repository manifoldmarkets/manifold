import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'
import { SweepstakesPrize, getTotalPrizePool } from 'common/sweepstakes'

type SweepstakesRow = {
  sweepstakes_num: number
  name: string
  prizes: SweepstakesPrize[]
  close_time: string
  created_time: string
  winning_ticket_ids: string[] | null
  user_won: boolean
  user_claim_status: 'awaiting' | 'sent' | 'rejected' | 'opted_out' | null
  user_has_wallet: boolean
}

// Compute the dropdown icon state purely from claim signals. Verification
// status (KYC) is layered on client-side because it's a global user flag
// that the dropdown row doesn't need to know about per-drawing.
function computeUserStatus(row: SweepstakesRow) {
  if (!row.user_won) return null
  if (row.user_claim_status === 'sent') return 'paid' as const
  if (row.user_claim_status === 'rejected') return null
  if (row.user_claim_status === 'opted_out') return null
  // No claim row yet OR awaiting without a submitted wallet.
  if (row.user_claim_status === null || !row.user_has_wallet) {
    return 'action-needed' as const
  }
  // awaiting + wallet submitted = waiting on payout.
  return 'pending' as const
}

export const getSweepstakesList: APIHandler<
  'get-sweepstakes-list'
> = async (_props, auth) => {
  const pg = createSupabaseDirectClient()
  const userId = auth?.uid ?? null

  const sweepstakes = await pg.manyOrNone<SweepstakesRow>(
    `select s.sweepstakes_num,
            s.name,
            s.prizes,
            s.close_time,
            s.created_time,
            s.winning_ticket_ids,
            c.payment_status as user_claim_status,
            (c.wallet_address is not null) as user_has_wallet,
            case
              when $1::text is null then false
              when s.winning_ticket_ids is null then false
              else exists (
                select 1
                from sweepstakes_tickets t
                where t.sweepstakes_num = s.sweepstakes_num
                  and t.user_id = $1
                  and t.id = any(s.winning_ticket_ids)
              )
            end as user_won
     from sweepstakes s
     left join sweepstakes_prize_claims c
       on c.sweepstakes_num = s.sweepstakes_num
       and c.user_id = $1
     order by s.sweepstakes_num desc`,
    [userId]
  )

  return {
    sweepstakes: sweepstakes.map((s) => ({
      sweepstakesNum: s.sweepstakes_num,
      name: s.name,
      closeTime: tsToMillis(s.close_time),
      createdTime: tsToMillis(s.created_time),
      hasWinners: !!(s.winning_ticket_ids && s.winning_ticket_ids.length > 0),
      // Total prize pool across all ranks — used by the past-drawings dropdown
      // to highlight big drawings (e.g. gold styling for $10k+).
      totalPrizeUsd: getTotalPrizePool(s.prizes),
      // Per-user claim status for the dropdown / banner icons. Null when
      // the user is unauthenticated, didn't win, or has resolved-negative
      // states (rejected / opted_out) we don't want to surface.
      userStatus: userId ? computeUserStatus(s) : null,
    })),
  }
}

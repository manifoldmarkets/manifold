import {
  chooseSportsGameAnte,
  SportsAnteDecision,
  SportsOpeningLine,
} from 'common/sports-kickoff-interface'
import type { SupabaseTransaction } from './supabase/init'

/** Transaction seam for the future kickoff mode and reserve check. */
export async function resolveSportsGameAnte(
  _tx: SupabaseTransaction,
  input: {
    creatorId: string
    competitionId: string
    kickoffTime: number
    startKnown: boolean
    baseAnte?: number
    line: SportsOpeningLine
  }
): Promise<SportsAnteDecision> {
  return chooseSportsGameAnte({ ...input, mode: 'off' })
}

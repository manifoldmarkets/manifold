import type { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/monitoring/log'

export type SportsKickoffSignal = {
  contractId: string
  kind: 'started' | 'moved-earlier' | 'missing' | 'postponed' | 'canceled'
  observedTime: number
  providerStartTime?: string
  detail?: unknown
}

/** The first observation is the audit timestamp even when later polls replay it. */
export async function reportSportsKickoffSignal(
  pg: Pick<SupabaseDirectClient, 'none'>,
  signal: SportsKickoffSignal
) {
  if (!Number.isSafeInteger(signal.observedTime) || signal.observedTime < 0)
    throw new Error('Invalid sports kickoff observation time')

  log.info('[sports-kickoff-signal]', {
    contractId: signal.contractId,
    kind: signal.kind,
    observedTime: signal.observedTime,
    providerStartTime: signal.providerStartTime,
  })
  if (signal.kind !== 'started') return
  await pg.none(
    `update contracts
     set data = jsonb_set(data, '{sportsObservedStartTime}', to_jsonb($2::bigint))
     where id = $1 and resolution is null
       and data->>'sportsObservedStartTime' is null`,
    [signal.contractId, signal.observedTime]
  )
}
